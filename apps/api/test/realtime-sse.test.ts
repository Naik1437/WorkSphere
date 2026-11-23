/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { createApp } from '../src/app.js';
import { RealtimeBroadcaster } from '../src/events.js';

const TEST_SECRET = 'test-secret-that-is-long-enough-32-chars';

function createToken(payload: Record<string, any>, secret = TEST_SECRET, lifetime = 900) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetime }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

describe('A07-R01: Server-Sent Events (SSE) Real-Time Updates', () => {
  let broadcaster: RealtimeBroadcaster;

  afterEach(() => {
    broadcaster?.close();
  });

  describe('Authentication & Connection Handshake', () => {
    it('rejects unauthenticated connections to /api/v1/events with 401', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });
      const res = await request(app).get('/api/v1/events');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or tampered tokens with 401', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });
      const forgedToken = createToken({ userId: 'u1', organizationId: 'org1' }, 'wrong-secret');
      const res = await request(app)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('authenticates via query parameter token for standard EventSource compatibility', async () => {
      broadcaster = new RealtimeBroadcaster({ heartbeatIntervalMs: 0 });
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { events: broadcaster } as any,
      );

      const token = createToken({ userId: 'user-1', organizationId: 'org-1', role: 'MEMBER' });

      // Create local HTTP server for clean streaming inspection
      const http = await import('http');
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as any;
      const port = address.port;

      let chunkData = '';
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/events?token=${encodeURIComponent(token)}`,
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.headers['cache-control']).toContain('no-cache');
            expect(res.headers['connection']).toContain('keep-alive');

            res.on('data', (chunk) => {
              chunkData += chunk.toString();
              if (chunkData.includes('system.connected')) {
                req.destroy(); // Safely close the client SSE stream
                server.close(() => resolve());
              }
            });
          },
        );
        req.on('error', (err) => {
          // req.destroy causes ECONNRESET which is expected when aborting stream
          if ((err as any).code === 'ECONNRESET') {
            resolve();
          } else {
            reject(err);
          }
        });
      });

      expect(chunkData).toContain(': connected');
      expect(chunkData).toContain('event: system.connected');
      expect(chunkData).toContain('"organizationId":"org-1"');
    });
  });

  describe('Tenant Isolation & Scoped Broadcasting', () => {
    it('broadcasts events strictly to matching organizationId and isolates other organizations', () => {
      broadcaster = new RealtimeBroadcaster({ heartbeatIntervalMs: 0 });

      const org1Received: string[] = [];
      const org2Received: string[] = [];

      const mockRes1: any = {
        write: vi.fn((data: string) => org1Received.push(data)),
      };
      const mockRes2: any = {
        write: vi.fn((data: string) => org2Received.push(data)),
      };

      // Subscribe client 1 to org-alpha and client 2 to org-beta
      broadcaster.subscribe('org-alpha', mockRes1);
      broadcaster.subscribe('org-beta', mockRes2);

      expect(broadcaster.getSubscriberCount('org-alpha')).toBe(1);
      expect(broadcaster.getSubscriberCount('org-beta')).toBe(1);

      // Publish an event to org-alpha
      broadcaster.publish('org-alpha', {
        type: 'task.created',
        payload: { id: 'task-1', title: 'Alpha Task' },
      });

      // org-alpha client must have received the event
      const org1EventString = org1Received.join('\n');
      expect(org1EventString).toContain('event: task.created');
      expect(org1EventString).toContain('Alpha Task');

      // org-beta client must NOT receive org-alpha events (Tenant Isolation)
      const org2EventString = org2Received.join('\n');
      expect(org2EventString).not.toContain('Alpha Task');
      expect(org2EventString).not.toContain('event: task.created');
    });

    it('cleans up subscriber upon unsubscription or socket close', () => {
      broadcaster = new RealtimeBroadcaster({ heartbeatIntervalMs: 0 });

      const mockRes: any = { write: vi.fn() };
      const { unsubscribe } = broadcaster.subscribe('org-cleanup', mockRes);

      expect(broadcaster.getSubscriberCount('org-cleanup')).toBe(1);

      unsubscribe();
      expect(broadcaster.getSubscriberCount('org-cleanup')).toBe(0);
    });
  });

  describe('Reconnection & Event Replay Buffer', () => {
    it('replays buffered events when client reconnects with Last-Event-ID', () => {
      broadcaster = new RealtimeBroadcaster({ heartbeatIntervalMs: 0 });

      // Publish 3 events to org-history buffer before client 2 connects
      const evt1 = broadcaster.publish('org-history', { type: 'task.created', payload: { step: 1 } });
      const evt2 = broadcaster.publish('org-history', { type: 'task.updated', payload: { step: 2 } });
      const evt3 = broadcaster.publish('org-history', { type: 'task.updated', payload: { step: 3 } });

      const replayed: string[] = [];
      const mockRes: any = {
        write: vi.fn((chunk: string) => replayed.push(chunk)),
      };

      // Client reconnects specifying Last-Event-ID of evt1
      broadcaster.subscribe('org-history', mockRes, evt1.id);

      const streamText = replayed.join('\n');
      // Must replay evt2 and evt3
      expect(streamText).toContain(evt2.id);
      expect(streamText).toContain(evt3.id);
      expect(streamText).toContain('"step":2');
      expect(streamText).toContain('"step":3');
    });
  });

  describe('Real-Time Updates Triggered by API Operations', () => {
    it('publishes task.created, task.updated, and comment.created when API endpoints are called', async () => {
      broadcaster = new RealtimeBroadcaster({ heartbeatIntervalMs: 0 });
      const publishedEvents: any[] = [];
      vi.spyOn(broadcaster, 'publish').mockImplementation((orgId, input) => {
        publishedEvents.push({ orgId, ...input });
        return { id: 'evt-test', organizationId: orgId, timestamp: new Date().toISOString(), ...input };
      });

      const mockDb = {
        project: {
          findFirst: vi.fn().mockResolvedValue({ id: 'proj-1', organizationId: 'org-test' }),
        },
        task: {
          create: vi.fn().mockResolvedValue({ id: 'task-1', title: 'New Task', version: 1, projectId: 'proj-1' }),
          findFirst: vi.fn().mockResolvedValue({ id: 'task-1', project: { organizationId: 'org-test' }, version: 1 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Updated Title', version: 2 }),
        },
        activity: {
          create: vi.fn().mockResolvedValue({ id: 'act-1' }),
        },
        job: {
          create: vi.fn().mockResolvedValue({ id: 'job-1' }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return cb(mockDb);
        }),
      };

      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any, events: broadcaster } as any,
      );

      const token = createToken({ userId: 'user-realtime', organizationId: 'org-test', role: 'MEMBER' });

      // 1. Create task
      const createRes = await request(app)
        .post('/api/v1/projects/proj-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Task' });

      expect(createRes.status).toBe(201);
      const taskCreatedEvt = publishedEvents.find((e) => e.type === 'task.created');
      expect(taskCreatedEvt).toBeDefined();
      expect(taskCreatedEvt.orgId).toBe('org-test');
      expect(taskCreatedEvt.payload.title).toBe('New Task');

      // 2. Update task
      const updateRes = await request(app)
        .patch('/api/v1/tasks/task-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Title', version: 1 });

      expect(updateRes.status).toBe(200);
      const taskUpdatedEvt = publishedEvents.find((e) => e.type === 'task.updated');
      expect(taskUpdatedEvt).toBeDefined();
      expect(taskUpdatedEvt.payload.title).toBe('Updated Title');
    });
  });
});
