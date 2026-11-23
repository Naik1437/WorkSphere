import request from 'supertest';
import { createHmac } from 'node:crypto';
import * as net from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import {
  generateAwsSigV4PresignedUrl,
  sanitizeStorageKey,
  S3StorageAdapter,
  SimulatedStorageAdapter,
  createStorageAdapterFromEnv,
} from '../src/storage.js';
import {
  ConsoleEmailAdapter,
  MemoryEmailAdapter,
  SmtpEmailAdapter,
  createEmailAdapterFromEnv,
} from '../src/integrations.js';
import {
  WORKSPHERE_PLANS,
  verifyStripeWebhookSignature,
  SandboxStripeBillingAdapter,
  MockBillingAdapter,
  createBillingAdapterFromEnv,
} from '../src/billing.js';
import { processJob } from '../src/worker.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long';

function createToken(payload: { userId: string; organizationId: string; role: string }) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString('base64url');
  const sig = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

describe('Task 20: Storage, Billing, and Email Integrations', () => {
  const orgAlpha = '11111111-1111-1111-1111-111111111111';
  const orgBeta = '22222222-2222-2222-2222-222222222222';
  const userAlpha = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const taskId = 'task-1111-1111-1111-111111111111';
  const attachmentId = 'att-1111-1111-1111-111111111111';

  const ownerToken = createToken({ userId: userAlpha, organizationId: orgAlpha, role: 'OWNER' });
  const managerToken = createToken({ userId: userAlpha, organizationId: orgAlpha, role: 'MANAGER' });
  const memberToken = createToken({ userId: userAlpha, organizationId: orgAlpha, role: 'MEMBER' });
  const auditorToken = createToken({ userId: userAlpha, organizationId: orgAlpha, role: 'AUDITOR' });
  const crossTenantToken = createToken({ userId: userAlpha, organizationId: orgBeta, role: 'OWNER' });

  // =========================================================================
  // PART 1: S3 / MinIO Object Storage Integration (A08-R02)
  // =========================================================================
  describe('Object Storage Integration (A08-R02)', () => {
    it('sanitizes storage keys and enforces tenant isolation path', () => {
      const key = sanitizeStorageKey('org-123', 'task-456', '../../etc/passwd.png');
      expect(key).not.toContain('..');
      expect(key.startsWith('tenants/org-123/tasks/task-456/')).toBe(true);
      expect(key.endsWith('_etc_passwd.png')).toBe(true);
    });

    it('generates compliant AWS SigV4 presigned URLs for MinIO (path-style)', () => {
      const presigned = generateAwsSigV4PresignedUrl({
        method: 'PUT',
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        bucket: 'worksphere-attachments',
        key: 'tenants/org-1/tasks/task-1/file.pdf',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
        expiresInSeconds: 600,
        forcePathStyle: true,
      });

      expect(presigned).toContain('http://minio:9000/worksphere-attachments/tenants/org-1/tasks/task-1/file.pdf');
      expect(presigned).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(presigned).toContain('X-Amz-Credential=minioadmin%2F');
      expect(presigned).toContain('X-Amz-Expires=600');
      expect(presigned).toContain('X-Amz-Signature=');
    });

    it('generates virtual-hosted presigned URLs when forcePathStyle is false', () => {
      const presigned = generateAwsSigV4PresignedUrl({
        method: 'GET',
        endpoint: 'https://s3.amazonaws.com',
        region: 'us-west-2',
        bucket: 'my-bucket',
        key: 'tenants/org-1/tasks/task-1/doc.docx',
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret-example',
        expiresInSeconds: 300,
        forcePathStyle: false,
      });

      expect(presigned).toContain('https://my-bucket.s3.amazonaws.com/tenants/org-1/tasks/task-1/doc.docx');
      expect(presigned).toContain('X-Amz-Expires=300');
    });

    it('S3StorageAdapter produces presigned upload and download results', async () => {
      const adapter = new S3StorageAdapter({
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        bucket: 'worksphere-attachments',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      });

      const upload = await adapter.createUpload({
        organizationId: orgAlpha,
        taskId,
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(upload.method).toBe('PUT');
      expect(upload.headers).toEqual({ 'Content-Type': 'application/pdf' });
      expect(upload.uploadUrl).toContain('worksphere-attachments/tenants/');
      expect(upload.storageKey).toContain(orgAlpha);

      const download = await adapter.getDownloadUrl({ storageKey: upload.storageKey });
      expect(download.downloadUrl).toContain('worksphere-attachments/tenants/');
      expect(download.expiresInSeconds).toBe(900);
    });

    it('SimulatedStorageAdapter provides deterministic local fallbacks', async () => {
      const adapter = new SimulatedStorageAdapter();
      const upload = await adapter.createUpload({
        organizationId: orgAlpha,
        taskId,
        filename: 'spec.txt',
        contentType: 'text/plain',
      });

      expect(upload.uploadUrl).toContain('/upload?key=');
      expect(upload.storageKey).toContain(orgAlpha);

      const download = await adapter.getDownloadUrl({ storageKey: upload.storageKey });
      expect(download.downloadUrl).toContain('/download?key=');

      const del = await adapter.deleteObject({ storageKey: upload.storageKey });
      expect(del.deleted).toBe(true);
    });

    it('createStorageAdapterFromEnv correctly instantiates S3StorageAdapter when configured', () => {
      const adapter = createStorageAdapterFromEnv({
        STORAGE_DRIVER: 'minio',
        STORAGE_ENDPOINT: 'http://minio:9000',
        STORAGE_BUCKET: 'test-bucket',
        STORAGE_ACCESS_KEY: 'test-key',
        STORAGE_SECRET_KEY: 'test-secret',
      });
      expect(adapter).toBeInstanceOf(S3StorageAdapter);
    });

    describe('Attachment API Endpoints', () => {
      const mockTask = {
        id: taskId,
        projectId: 'proj-1',
        project: { organizationId: orgAlpha },
      };

      const mockAttachment = {
        id: attachmentId,
        taskId,
        filename: 'architecture.png',
        contentType: 'image/png',
        storageKey: `tenants/${orgAlpha}/tasks/${taskId}/arch.png`,
        sizeBytes: 2048,
        createdAt: new Date(),
      };

      it('POST /tasks/:taskId/attachments creates attachment record and returns presigned upload URL', async () => {
        const mockDb = {
          task: { findFirst: vi.fn().mockResolvedValue(mockTask) },
          attachment: { create: vi.fn().mockResolvedValue(mockAttachment) },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .post(`/api/v1/tasks/${taskId}/attachments`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            filename: 'architecture.png',
            contentType: 'image/png',
            sizeBytes: 2048,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(attachmentId);
        expect(res.body.upload).toBeDefined();
        expect(res.body.upload.uploadUrl).toBeDefined();
        expect(res.body.upload.method).toBe('PUT');
      });

      it('GET /tasks/:taskId/attachments lists all attachments for the task', async () => {
        const mockDb = {
          task: { findFirst: vi.fn().mockResolvedValue(mockTask) },
          attachment: { findMany: vi.fn().mockResolvedValue([mockAttachment]) },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .get(`/api/v1/tasks/${taskId}/attachments`)
          .set('Authorization', `Bearer ${memberToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].filename).toBe('architecture.png');
      });

      it('GET /tasks/:taskId/attachments/:id/download returns presigned download URL', async () => {
        const mockDb = {
          task: { findFirst: vi.fn().mockResolvedValue(mockTask) },
          attachment: { findFirst: vi.fn().mockResolvedValue(mockAttachment) },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .get(`/api/v1/tasks/${taskId}/attachments/${attachmentId}/download`)
          .set('Authorization', `Bearer ${memberToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toBeDefined();
        expect(res.body.data.filename).toBe('architecture.png');
      });

      it('DELETE /tasks/:taskId/attachments/:id deletes attachment and storage object', async () => {
        const mockDb = {
          task: { findFirst: vi.fn().mockResolvedValue(mockTask) },
          attachment: {
            findFirst: vi.fn().mockResolvedValue(mockAttachment),
            delete: vi.fn().mockResolvedValue(mockAttachment),
          },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .delete(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`)
          .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.deleted).toBe(true);
        expect(mockDb.attachment.delete).toHaveBeenCalledWith({ where: { id: attachmentId } });
      });

      it('enforces multi-tenant isolation: cross-tenant access to attachments returns 404', async () => {
        const mockDb = {
          task: { findFirst: vi.fn().mockResolvedValue(null) }, // not found in Org Beta
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .get(`/api/v1/tasks/${taskId}/attachments`)
          .set('Authorization', `Bearer ${crossTenantToken}`);

        expect(res.status).toBe(404);
      });
    });
  });

  // =========================================================================
  // PART 2: Billing Scope & Sandbox Stripe Integration (A08-R06)
  // =========================================================================
  describe('Billing Scope & Sandbox Integration (A08-R06)', () => {
    const webhookSecret = 'whsec_test_secret_for_unit_tests_123456';

    function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
      const signedPayload = `${timestamp}.${payload}`;
      const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
      return `t=${timestamp},v1=${sig}`;
    }

    it('exposes defined subscription plans (FREE, PRO, ENTERPRISE)', () => {
      const plans = Object.values(WORKSPHERE_PLANS);
      expect(plans).toHaveLength(3);
      expect(plans.map((p) => p.id)).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
    });

    it('verifies valid Stripe test-mode webhook signatures with timingSafeEqual', () => {
      const payload = JSON.stringify({ id: 'evt_123', type: 'customer.subscription.updated' });
      const header = signStripePayload(payload, webhookSecret);

      const isValid = verifyStripeWebhookSignature(payload, header, webhookSecret);
      expect(isValid).toBe(true);
    });

    it('rejects stale webhook timestamps exceeding tolerance (replay defense)', () => {
      const payload = JSON.stringify({ id: 'evt_stale', type: 'customer.subscription.updated' });
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s > 300s tolerance
      const header = signStripePayload(payload, webhookSecret, staleTimestamp);

      const isValid = verifyStripeWebhookSignature(payload, header, webhookSecret);
      expect(isValid).toBe(false);
    });

    it('rejects tampered webhook payloads with invalid signature', () => {
      const payload = JSON.stringify({ id: 'evt_123', type: 'customer.subscription.created' });
      const header = signStripePayload(payload, webhookSecret);
      const tampered = JSON.stringify({ id: 'evt_123', type: 'customer.subscription.deleted' });

      const isValid = verifyStripeWebhookSignature(tampered, header, webhookSecret);
      expect(isValid).toBe(false);
    });

    it('SandboxStripeBillingAdapter generates test checkout session without storing card numbers', async () => {
      const adapter = new SandboxStripeBillingAdapter('sk_test_mock', webhookSecret);
      const session = await adapter.createCheckoutSession({
        organizationId: orgAlpha,
        planId: 'PRO',
        successUrl: 'https://worksphere.local/billing/success',
        cancelUrl: 'https://worksphere.local/billing/cancel',
      });

      expect(session.mode).toBe('sandbox');
      expect(session.sessionId.startsWith('cs_test_')).toBe(true);
      expect(session.sessionUrl).toContain('checkout.stripe.com/c/pay/cs_test_');
      expect(session.sessionUrl).toContain('plan=PRO');
    });

    describe('Billing API Endpoints', () => {
      it('GET /billing/plans returns public plan tiers', async () => {
        const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });
        const res = await request(app).get('/api/v1/billing/plans');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data[0].id).toBe('FREE');
      });

      it('POST /billing/checkout creates sandbox checkout session for OWNER', async () => {
        const mockDb = { user: { findUnique: vi.fn() } };
        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .post('/api/v1/billing/checkout')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ planId: 'PRO' });

        expect(res.status).toBe(200);
        expect(res.body.data.sessionId).toBeDefined();
        expect(res.body.data.sessionUrl).toBeDefined();
      });

      it('POST /billing/checkout denies non-owner roles (AUDITOR, MEMBER)', async () => {
        const mockDb = { user: { findUnique: vi.fn() } };
        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .post('/api/v1/billing/checkout')
          .set('Authorization', `Bearer ${auditorToken}`)
          .send({ planId: 'PRO' });

        expect(res.status).toBe(403);
      });

      it('POST /billing/webhook processes valid webhook and records idempotently', async () => {
        const payload = JSON.stringify({
          id: 'evt_stripe_test_1',
          type: 'customer.subscription.created',
          data: { object: { client_reference_id: orgAlpha, planId: 'PRO', status: 'active' } },
        });
        const header = signStripePayload(payload, 'whsec_test_mock_secret_for_worksphere');

        const mockDb = {
          webhookEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt-rec-1' }),
          },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .post('/api/v1/billing/webhook')
          .set('stripe-signature', header)
          .send(JSON.parse(payload));

        expect(res.status).toBe(200);
        expect(res.body.received).toBe(true);
        expect(mockDb.webhookEvent.create).toHaveBeenCalled();
      });

      it('POST /billing/webhook rejects duplicate webhook deliveries gracefully (P2002)', async () => {
        const payload = JSON.stringify({
          id: 'evt_duplicate_stripe',
          type: 'customer.subscription.created',
          data: { object: { client_reference_id: orgAlpha } },
        });
        const header = signStripePayload(payload, 'whsec_test_mock_secret_for_worksphere');

        const p2002Error = new Error('Unique constraint failed on the fields: (`provider`,`external_id`)');
        (p2002Error as any).code = 'P2002';

        const mockDb = {
          webhookEvent: {
            create: vi.fn().mockRejectedValue(p2002Error),
          },
        };

        const app = createApp(
          { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
          { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
        );

        const res = await request(app)
          .post('/api/v1/billing/webhook')
          .set('stripe-signature', header)
          .send(JSON.parse(payload));

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('duplicate_ignored');
      });
    });
  });

  // =========================================================================
  // PART 3: Email Integration & Transports (A08-R01)
  // =========================================================================
  describe('Email Integration & Transports (A08-R01)', () => {
    it('ConsoleEmailAdapter sends email log without throwing', async () => {
      const adapter = new ConsoleEmailAdapter();
      await expect(
        adapter.send({
          to: 'engineer@worksphere.local',
          subject: 'Task assigned',
          text: 'You have been assigned to task-1',
          idempotencyKey: 'idem-email-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('MemoryEmailAdapter accumulates sent messages for assertions', async () => {
      const adapter = new MemoryEmailAdapter();
      expect(adapter.getSent()).toHaveLength(0);

      await adapter.send({
        to: 'user@example.com',
        subject: 'Welcome to WorkSphere',
        text: 'Hello!',
        idempotencyKey: 'idem-1',
      });

      expect(adapter.getSent()).toHaveLength(1);
      expect(adapter.getSent()[0].to).toBe('user@example.com');
      expect(adapter.getSent()[0].subject).toBe('Welcome to WorkSphere');

      adapter.clear();
      expect(adapter.getSent()).toHaveLength(0);
    });

    it('SmtpEmailAdapter executes full SMTP handshake with standard SMTP commands', async () => {
      // Create a lightweight in-process mock SMTP server to verify standard RFC 5321 exchange
      const receivedCommands: string[] = [];
      const server = net.createServer((socket) => {
        socket.on('error', () => {});
        socket.write('220 mailpit.local ESMTP WorkSphere\r\n');
        socket.on('data', (chunk) => {
          const str = chunk.toString();
          receivedCommands.push(str.trim());
          if (str.startsWith('EHLO')) {
            socket.write('250-mailpit.local Hello\r\n250 AUTH PLAIN LOGIN\r\n');
          } else if (str.startsWith('MAIL FROM:')) {
            socket.write('250 2.1.0 Sender ok\r\n');
          } else if (str.startsWith('RCPT TO:')) {
            socket.write('250 2.1.5 Recipient ok\r\n');
          } else if (str.startsWith('DATA')) {
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (str.includes('\r\n.\r\n') || str.endsWith('.\r\n')) {
            socket.write('250 2.0.0 Ok: queued as 12345\r\n');
          } else if (str.startsWith('QUIT')) {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          }
        });
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as net.AddressInfo).port;

      try {
        const adapter = new SmtpEmailAdapter({
          host: '127.0.0.1',
          port,
          from: 'system@worksphere.local',
        });

        await adapter.send({
          to: 'alert@worksphere.local',
          subject: 'Build Completed',
          text: 'Artifacts generated successfully.',
          idempotencyKey: 'smtp-idem-123',
        });

        expect(receivedCommands.some((c) => c.startsWith('EHLO'))).toBe(true);
        expect(receivedCommands.some((c) => c.includes('MAIL FROM:<system@worksphere.local>'))).toBe(true);
        expect(receivedCommands.some((c) => c.includes('RCPT TO:<alert@worksphere.local>'))).toBe(true);
        expect(receivedCommands.some((c) => c.startsWith('DATA'))).toBe(true);
        expect(receivedCommands.some((c) => c.startsWith('QUIT'))).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('createEmailAdapterFromEnv selects SmtpEmailAdapter when SMTP_HOST is present', () => {
      const adapter = createEmailAdapterFromEnv({
        EMAIL_DRIVER: 'smtp',
        SMTP_HOST: 'mailpit',
        SMTP_PORT: '1025',
      });
      expect(adapter).toBeInstanceOf(SmtpEmailAdapter);
    });

    it('processJob in worker handles notification jobs using the email adapter', async () => {
      const email = new MemoryEmailAdapter();
      const mockJob = {
        id: 'job-1',
        type: 'notification.reminder',
        payload: { email: 'recipient@worksphere.local', message: 'Meeting at 3 PM' },
        idempotencyKey: 'idem-worker-1',
        attempts: 0,
      };

      const mockPrisma = {
        job: {
          findFirst: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: 'job-1', attempts: 1 }),
        },
      };

      const result = await processJob(mockPrisma, email, mockJob);

      expect(result.status).toBe('completed');
      expect(result.attempts).toBe(1);
      expect(email.getSent()).toHaveLength(1);
      expect(email.getSent()[0].to).toBe('recipient@worksphere.local');
      expect(email.getSent()[0].subject).toBe('WorkSphere notification.reminder');
    });
  });
});
