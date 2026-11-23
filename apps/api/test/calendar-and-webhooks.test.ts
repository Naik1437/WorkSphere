import request from 'supertest';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import {
  generateIcsCalendar,
  formatIcsDate,
  escapeIcsText,
  webhookSignature,
  verifyWebhookSignature,
  ConsoleWebhookAdapter,
} from '../src/integrations.js';
import { processJob } from '../src/worker.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long';

function createToken(payload: { userId: string; organizationId: string; role: string }) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString('base64url');
  const sig = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

describe('Calendar Export & Webhook Integration (A08-R03)', () => {
  const orgId = '11111111-2222-3333-4444-555555555555';
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const projectId = 'proj-9999-8888-7777-666666666666';

  const ownerToken = createToken({ userId, organizationId: orgId, role: 'OWNER' });
  const auditorToken = createToken({ userId, organizationId: orgId, role: 'AUDITOR' });

  describe('RFC 5545 iCalendar Generation', () => {
    it('generates valid RFC 5545 iCalendar string with tasks and milestones', () => {
      const ics = generateIcsCalendar({
        projectName: 'Enterprise Platform Rollout',
        projectDescription: 'Migration of core systems, Q4 deliverable',
        items: [
          {
            id: 'm-1',
            title: 'Beta Release',
            description: 'Public beta release date',
            startDate: new Date('2026-12-01T10:00:00.000Z'),
            type: 'MILESTONE',
            status: 'ACTIVE',
          },
          {
            id: 't-1',
            title: 'Deploy API Gateway',
            description: 'Setup Traefik / Envoy ingress',
            startDate: new Date('2026-11-25T14:30:00.000Z'),
            type: 'TASK',
            status: 'DONE',
          },
        ],
      });

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('VERSION:2.0\r\n');
      expect(ics).toContain('PRODID:-//WorkSphere//WorkSphere Project Management//EN\r\n');
      expect(ics).toContain('CALSCALE:GREGORIAN\r\n');
      expect(ics).toContain('X-WR-CALNAME:Enterprise Platform Rollout\r\n');

      // Milestone event
      expect(ics).toContain('UID:milestone-m-1@worksphere.local\r\n');
      expect(ics).toContain('SUMMARY:[MILESTONE] Beta Release\r\n');

      // Task event
      expect(ics).toContain('UID:task-t-1@worksphere.local\r\n');
      expect(ics).toContain('SUMMARY:[TASK] Deploy API Gateway\r\n');
      expect(ics).toContain('STATUS:COMPLETED\r\n');

      expect(ics).toContain('END:VCALENDAR\r\n');
    });

    it('escapes special characters correctly according to RFC 5545', () => {
      expect(escapeIcsText('Hello, world; line1\nline2')).toBe('Hello\\, world\\; line1\\nline2');
    });

    it('formats UTC dates in standard iCalendar format', () => {
      const date = new Date('2026-11-23T10:15:30.000Z');
      expect(formatIcsDate(date)).toBe('20261123T101530Z');
    });
  });

  describe('Calendar Export Endpoint', () => {
    it('rejects unauthenticated requests to calendar export', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });
      const res = await request(app).get(`/api/v1/projects/${projectId}/calendar.ics`);
      expect(res.status).toBe(401);
    });

    it('returns 404 if project does not belong to user organization', async () => {
      const mockDb = {
        project: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
      );

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/calendar.ics`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(mockDb.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: projectId, organizationId: orgId } }),
      );
    });

    it('returns text/calendar attachment with 200 OK for tenant project', async () => {
      const mockDb = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            id: projectId,
            organizationId: orgId,
            name: 'Cloud Infrastructure Upgrade',
            description: 'Core Kubernetes transition',
            createdAt: new Date('2026-11-01T00:00:00.000Z'),
            milestones: [
              {
                id: 'm-100',
                name: 'Cluster Provisioning',
                dueAt: new Date('2026-11-30T00:00:00.000Z'),
              },
            ],
            tasks: [
              {
                id: 't-200',
                title: 'Apply Helm charts',
                description: 'Deploy ingress and cert-manager',
                status: 'IN_PROGRESS',
                dueAt: new Date('2026-11-28T12:00:00.000Z'),
              },
            ],
          }),
        },
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
      );

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/calendar.ics`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/calendar');
      expect(res.header['content-disposition']).toContain('attachment');
      expect(res.text).toContain('BEGIN:VCALENDAR');
      expect(res.text).toContain('Cloud Infrastructure Upgrade');
      expect(res.text).toContain('Cluster Provisioning');
      expect(res.text).toContain('Apply Helm charts');
      expect(res.text).toContain('END:VCALENDAR');
    });
  });

  describe('Webhook Dispatch Integration & Outbox Worker', () => {
    it('verifies HMAC SHA-256 webhook signatures', () => {
      const secret = 'webhook-super-secret-key';
      const body = JSON.stringify({ event: 'task.created', id: 'task-123' });
      const signature = webhookSignature(secret, body);

      expect(verifyWebhookSignature(secret, body, signature)).toBe(true);
      expect(verifyWebhookSignature(secret, body, 'bad-signature')).toBe(false);
      expect(verifyWebhookSignature('wrong-secret', body, signature)).toBe(false);
    });

    it('rejects webhook dispatch for AUDITOR role', async () => {
      const mockDb = { project: { findFirst: vi.fn() } };
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
      );
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/webhooks/dispatch`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          targetUrl: 'https://example.com/webhook',
          secret: 'wh-secret-key-123',
          event: 'milestone.completed',
          idempotencyKey: 'idemp-1111-2222',
        });

      expect(res.status).toBe(403);
    });

    it('queues webhook dispatch job into persistent outbox for OWNER role', async () => {
      const mockDb = {
        project: {
          findFirst: vi.fn().mockResolvedValue({ id: projectId, organizationId: orgId }),
        },
        job: {
          create: vi.fn().mockResolvedValue({
            id: 'job-webhook-1',
            type: 'webhook.dispatch',
            idempotencyKey: 'idemp-1111-2222',
          }),
        },
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
      );

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/webhooks/dispatch`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          targetUrl: 'https://example.com/webhook',
          secret: 'wh-secret-key-123',
          event: 'milestone.completed',
          payload: { milestoneId: 'm-100', name: 'Phase 1 Complete' },
          idempotencyKey: 'idemp-1111-2222',
        });

      expect(res.status).toBe(202);
      expect(mockDb.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'webhook.dispatch',
            idempotencyKey: 'idemp-1111-2222',
          }),
        }),
      );
    });

    it('processes webhook.dispatch outbox job and updates status to completed', async () => {
      const mockPrisma = {
        job: {
          findFirst: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: 'job-1', completedAt: new Date() }),
        },
      };
      const mockWebhookAdapter = {
        dispatch: vi.fn().mockResolvedValue({ signature: 'mock-sig', delivered: true }),
      };
      const mockEmailAdapter = { send: vi.fn() };

      const job = {
        id: 'job-1',
        type: 'webhook.dispatch',
        payload: {
          targetUrl: 'https://webhook.site/test',
          secret: 'secret-123',
          event: 'task.status_changed',
          payload: { taskId: 't-1', status: 'DONE' },
        },
        idempotencyKey: 'wh-idemp-1',
        attempts: 0,
      };

      const result = await processJob(mockPrisma, mockEmailAdapter, job, mockWebhookAdapter);
      expect(result.status).toBe('completed');
      expect(mockWebhookAdapter.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUrl: 'https://webhook.site/test',
          event: 'task.status_changed',
          idempotencyKey: 'wh-idemp-1',
        }),
      );
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ attempts: 1 }),
        }),
      );
    });
  });
});
