/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { createApp } from '../src/app.js';
import { processJob, type WorkerPrisma } from '../src/worker.js';
import { planRetry, notificationEventKey } from '../src/jobs.js';
import type { EmailAdapter, WebhookAdapter } from '../src/integrations.js';

const TEST_SECRET = 'test-secret-that-is-long-enough-32-chars';

function createToken(payload: Record<string, any>, secret = TEST_SECRET, lifetime = 900) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetime }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

describe('A15-R05 through A15-R11: Incident Response Drills', () => {
  // A15-R05: Service Outage / API Latency & Probe Readiness Drill
  describe('A15-R05: Service Outage & Probe Readiness Drill', () => {
    it('returns HTTP 503 on /ready when database latency/ping fails, while /health remains 200', async () => {
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        {
          databasePing: async () => {
            throw new Error('Connection pool saturation timeout (5000ms)');
          },
          redisPing: async () => undefined,
        },
      );

      // Liveness probe must succeed so orchestrator does not restart containers during transient dependency latency
      const healthRes = await request(app).get('/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.status).toBe('ok');

      // Readiness probe must fail so traffic is shed
      const readyRes = await request(app).get('/ready');
      expect(readyRes.status).toBe(503);
      expect(readyRes.body.status).toBe('unavailable');
      expect(readyRes.body.checks.database).toBe('unavailable');
      expect(readyRes.body.checks.redis).toBe('ok');
    });

    it('recovers /ready to HTTP 200 when database and redis latencies normalize', async () => {
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
        },
      );

      const readyRes = await request(app).get('/ready');
      expect(readyRes.status).toBe(200);
      expect(readyRes.body.status).toBe('ready');
    });
  });

  // A15-R06: Database Failure & Safe Recovery Drill
  describe('A15-R06: Database Failure & Safe Recovery Drill', () => {
    it('gracefully degrades write operations with 503 DATABASE_UNAVAILABLE when database is disconnected', async () => {
      // App initialized without active database client
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });

      const token = createToken({ sub: 'user-1', organizationId: 'org-1', role: 'MEMBER' });
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Emergency Project' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    });
  });

  // A15-R07: Worker / Message Queue Failure Drill
  describe('A15-R07: Worker Failure & Dead-Lettering Drill', () => {
    it('schedules bounded exponential backoff on transient failure and dead-letters at max attempts', async () => {
      const updatedRecords: any[] = [];
      const mockPrisma: WorkerPrisma = {
        job: {
          findFirst: vi.fn(),
          update: vi.fn().mockImplementation(async (args) => {
            updatedRecords.push(args);
            return args.data;
          }),
        },
      };

      const failingEmail: EmailAdapter = {
        send: vi.fn().mockRejectedValue(new Error('Connection reset by peer: Redis queue dropped')),
      };

      // 1. Transient failure on attempt 1 -> schedules retry
      const jobAttempt1 = {
        id: 'job-drill-1',
        idempotencyKey: 'drill-task-1:task.updated:2',
        type: 'notification.task-updated',
        payload: { email: 'devops@example.com' },
        attempts: 0,
      };

      const res1 = await processJob(mockPrisma, failingEmail, jobAttempt1);
      expect(res1.status).toBe('retrying');
      expect(res1.attempts).toBe(1);
      expect(updatedRecords[0].data.availableAt).toBeDefined();
      expect(updatedRecords[0].data.lastError).toContain('Redis queue dropped');

      // 2. Persistent failure reaching max attempts (attempt 4 -> 5)
      const jobAttempt4 = {
        id: 'job-drill-1',
        idempotencyKey: 'drill-task-1:task.updated:2',
        type: 'notification.task-updated',
        payload: { email: 'devops@example.com' },
        attempts: 4,
      };

      const resMax = await processJob(mockPrisma, failingEmail, jobAttempt4);
      expect(resMax.status).toBe('dead_letter');
      expect(resMax.attempts).toBe(5);
      expect(updatedRecords[1].data.failedAt).toBeDefined();
      expect(updatedRecords[1].data.lastError).toContain('Redis queue dropped');
    });

    it('verifies deterministic exponential backoff schedule', () => {
      expect(planRetry(1)).toEqual({ retry: true, delaySeconds: 2, deadLetter: false });
      expect(planRetry(2)).toEqual({ retry: true, delaySeconds: 4, deadLetter: false });
      expect(planRetry(3)).toEqual({ retry: true, delaySeconds: 8, deadLetter: false });
      expect(planRetry(4)).toEqual({ retry: true, delaySeconds: 16, deadLetter: false });
      expect(planRetry(5)).toEqual({ retry: false, delaySeconds: 0, deadLetter: true });
    });
  });

  // A15-R08: Duplicate Job / Event Idempotency Drill
  describe('A15-R08: Duplicate Job & Event Idempotency Drill', () => {
    it('produces deterministic, versioned idempotency keys for task events', () => {
      const key1 = notificationEventKey('task-abc', 'task.created', 1);
      const key2 = notificationEventKey('task-abc', 'task.created', 1);
      const key3 = notificationEventKey('task-abc', 'task.updated', 2);

      expect(key1).toBe('task-abc:task.created:1');
      expect(key1).toBe(key2); // identical key prevents duplicate job creation
      expect(key1).not.toBe(key3); // new version generates distinct key
    });

    it('handles reminder creation with deduplication on idempotencyKey via job upsert', async () => {
      const existingJob = {
        id: 'job-reminder-1',
        idempotencyKey: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        type: 'notification.reminder',
        availableAt: new Date(),
      };

      const mockDb = {
        task: {
          findFirst: vi.fn().mockResolvedValue({ id: 'task-1', project: { organizationId: 'org-1' } }),
        },
        job: {
          upsert: vi.fn().mockImplementation(async ({ where, create }) => {
            // If already exists, upsert returns the existing record without duplicating
            if (where.idempotencyKey === existingJob.idempotencyKey) {
              return existingJob;
            }
            return { id: 'new-job', ...create };
          }),
        },
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );

      const token = createToken({ userId: 'user-1', organizationId: 'org-1', role: 'MEMBER' });

      // When the exact same idempotencyKey is submitted again, existing job is returned with 202
      const res = await request(app)
        .post('/api/v1/tasks/task-1/reminders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          idempotencyKey: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          deliverAt: new Date().toISOString(),
        });

      expect(res.status).toBe(202);
      expect(res.body.data.id).toBe('job-reminder-1');
      expect(mockDb.job.upsert).toHaveBeenCalled();
    });
  });

  // A15-R09: Security Incident / Cross-Tenant Access Attempt Drill
  describe('A15-R09: Cross-Tenant Access Incident Drill', () => {
    it('denies access (404/403) when user from Org A attempts to access resources belonging to Org B', async () => {
      const mockDb = {
        project: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            // Project exists in org-beta, but query filters by where.organizationId = req.identity.organizationId
            if (where.organizationId === 'org-beta' && where.id === 'proj-beta') {
              return { id: 'proj-beta', organizationId: 'org-beta', name: 'Confidential Project' };
            }
            return null; // Org A cannot see Org B's project
          }),
        },
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );

      // Attacker token belonging to org-alpha
      const attackerToken = createToken({ sub: 'attacker-1', organizationId: 'org-alpha', role: 'MEMBER' });

      const res = await request(app)
        .get('/api/v1/projects/proj-beta')
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects tampered or forged authentication signatures', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });

      // Generate token with wrong secret
      const forgedToken = createToken(
        { sub: 'attacker-1', organizationId: 'victim-org' },
        'wrong-secret-key-that-does-not-match',
      );

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // A15-R10: Concurrency Conflict / Stale Task Update Collision Drill
  describe('A15-R10: Concurrency Conflict & Stale Update Collision Drill', () => {
    it('prevents silent overwrite and returns HTTP 409 VERSION_CONFLICT on stale updates', async () => {
      const currentTask = {
        id: 'task-concurrent-1',
        projectId: 'proj-1',
        title: 'Original Title',
        version: 2, // Task is currently at version 2 in DB
      };

      const mockDb = {
        task: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === currentTask.id) return currentTask;
            return null;
          }),
          updateMany: vi.fn().mockImplementation(async ({ where }) => {
            // Optimistic concurrency check: if client sent version 1, but where.version requires 1 and DB is 2
            if (where.version === currentTask.version) {
              return { count: 1 };
            }
            return { count: 0 }; // Stale update -> 0 rows updated!
          }),
        },
        $transaction: vi.fn(),
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );

      const tokenUser2 = createToken({ userId: 'user-2', organizationId: 'org-1', role: 'MEMBER' });

      // Client 2 submits an update with stale version 1 (while DB is already at version 2)
      const staleRes = await request(app)
        .patch('/api/v1/tasks/task-concurrent-1')
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({
          title: 'Stale Update From User 2',
          version: 1, // Stale version!
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('VERSION_CONFLICT');
      expect(staleRes.body.error.message).toContain('reload before retrying');

      // Database transaction was NOT invoked
      expect(mockDb.task.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-concurrent-1', version: 1 },
        data: { title: 'Stale Update From User 2', version: { increment: 1 } },
      });
      expect(mockDb.$transaction).not.toHaveBeenCalled();
    });
  });

  // A15-R11: External Dependency / Communication & Alert Response Drill
  describe('A15-R11: External Dependency & Communication Failure Drill', () => {
    it('handles webhook dispatch failures gracefully without crashing worker loop', async () => {
      const updatedRecords: any[] = [];
      const mockPrisma: WorkerPrisma = {
        job: {
          findFirst: vi.fn(),
          update: vi.fn().mockImplementation(async (args) => {
            updatedRecords.push(args);
            return args.data;
          }),
        },
      };

      const failingWebhook: WebhookAdapter = {
        dispatch: vi.fn().mockRejectedValue(new Error('Webhook endpoint returned HTTP 500 Internal Error')),
      };

      const webhookJob = {
        id: 'job-webhook-1',
        idempotencyKey: 'webhook-dispatch-key-1',
        type: 'webhook.dispatch',
        payload: {
          targetUrl: 'https://partner.example.com/webhook',
          event: 'task.completed',
        },
        attempts: 0,
      };

      const result = await processJob(mockPrisma, { send: vi.fn() }, webhookJob, failingWebhook);

      expect(result.status).toBe('retrying');
      expect(result.attempts).toBe(1);
      expect(updatedRecords[0].data.lastError).toContain('Webhook endpoint returned HTTP 500');
      expect(updatedRecords[0].data.availableAt).toBeDefined();
    });
  });
});
