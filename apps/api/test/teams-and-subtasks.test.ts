import request from 'supertest';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const TEST_SECRET = 'test-secret-that-is-long-enough-32';

function createToken(payload: { userId: string; organizationId: string; role: string }) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString('base64url');
  const sig = createHmac('sha256', TEST_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

describe('Teams API & Subtasks hierarchy', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const ownerToken = createToken({ userId, organizationId: orgId, role: 'OWNER' });
  const auditorToken = createToken({ userId, organizationId: orgId, role: 'AUDITOR' });

  it('rejects /teams access without authorization token', async () => {
    const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });
    const res = await request(app).get('/api/v1/teams');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('lists teams scoped to active organization', async () => {
    const mockDb = {
      team: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'team-1', organizationId: orgId, name: 'Platform Engineering', members: [] },
          ]),
      },
    };
    const app = createApp(
      { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
      { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
    );

    const res = await request(app)
      .get('/api/v1/teams')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Platform Engineering');
    expect(mockDb.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: orgId } }),
    );
  });

  it('allows OWNER to create a team in organization', async () => {
    const mockDb = {
      team: {
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'team-new',
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      },
    };
    const app = createApp(
      { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
      { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
    );

    const res = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Frontend Team', description: 'Core UI engineers' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Frontend Team');
    expect(mockDb.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Frontend Team',
          organizationId: orgId,
        }),
      }),
    );
  });

  it('prevents AUDITOR from creating teams with 403 FORBIDDEN', async () => {
    const mockDb = { team: { create: vi.fn() } };
    const app = createApp(
      { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
      { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
    );

    const res = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ name: 'Security Team' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockDb.team.create).not.toHaveBeenCalled();
  });

  it('lists subtasks for a parent task', async () => {
    const taskId = '33333333-3333-3333-3333-333333333333';
    const mockDb = {
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: taskId, projectId: 'proj-1' }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'sub-1', parentId: taskId, title: 'Write tests', status: 'TODO' },
          { id: 'sub-2', parentId: taskId, title: 'Code review', status: 'DONE' },
        ]),
      },
    };
    const app = createApp(
      { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
      { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
    );

    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Write tests');
  });

  it('creates subtask under parent task with transaction and activity', async () => {
    const taskId = '33333333-3333-3333-3333-333333333333';
    const subtaskId = '44444444-4444-4444-4444-444444444444';
    const mockDb = {
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: taskId, projectId: 'proj-1' }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          task: {
            create: vi.fn().mockResolvedValue({
              id: subtaskId,
              title: 'Implement subtask endpoint',
              parentId: taskId,
              projectId: 'proj-1',
              version: 1,
            }),
          },
          activity: { create: vi.fn().mockResolvedValue({}) },
          job: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      }),
    };
    const app = createApp(
      { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
      { databasePing: async () => undefined, redisPing: async () => undefined, database: mockDb },
    );

    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Implement subtask endpoint' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(subtaskId);
    expect(res.body.data.parentId).toBe(taskId);
  });
});
