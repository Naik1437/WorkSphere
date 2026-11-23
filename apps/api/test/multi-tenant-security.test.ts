/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
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

describe('A12-R06: Multi-Tenant Security & Penetration Testing', () => {
  // Fixtures representing two completely separate organizations
  const orgAlpha = { id: 'org-alpha', name: 'Alpha Corp' };
  const orgBeta = { id: 'org-beta', name: 'Beta Ltd' };

  const userAlphaOwner = { userId: 'user-alpha-owner', organizationId: orgAlpha.id, role: 'OWNER' };
  const userAlphaMember = {
    userId: 'user-alpha-member',
    organizationId: orgAlpha.id,
    role: 'MEMBER',
  };
  const userAlphaAuditor = {
    userId: 'user-alpha-auditor',
    organizationId: orgAlpha.id,
    role: 'AUDITOR',
  };

  const userBetaOwner = { userId: 'user-beta-owner', organizationId: orgBeta.id, role: 'OWNER' };
  const userBetaMember = {
    userId: 'b0000000-0000-0000-0000-000000000002',
    organizationId: orgBeta.id,
    role: 'MEMBER',
  };

  const projectBeta = {
    id: 'b0000000-0000-0000-0000-000000000101',
    organizationId: orgBeta.id,
    name: 'Confidential Beta Defense Project',
  };

  const taskBeta = {
    id: 'b0000000-0000-0000-0000-000000000501',
    projectId: projectBeta.id,
    title: 'Classified Beta Secret Task',
    version: 1,
  };

  const teamBeta = {
    id: 'b0000000-0000-0000-0000-000000000301',
    organizationId: orgBeta.id,
    name: 'Beta Core Engineering',
  };

  // Mock database double with multi-tenant awareness
  function createMockDb() {
    return {
      membership: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          const { organizationId, userId } = where.organizationId_userId || {};
          if (organizationId === orgAlpha.id && userId.startsWith('user-alpha')) {
            return { organizationId, userId, role: 'MEMBER' };
          }
          if (organizationId === orgBeta.id && userId.startsWith('user-beta')) {
            return { organizationId, userId, role: 'MEMBER' };
          }
          return null;
        }),
      },
      project: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === projectBeta.id && where.organizationId === orgBeta.id) {
            return projectBeta;
          }
          if (where.id === 'proj-alpha-101' && where.organizationId === orgAlpha.id) {
            return { id: 'proj-alpha-101', organizationId: orgAlpha.id, name: 'Alpha Project' };
          }
          return null;
        }),
        update: vi.fn(),
        delete: vi.fn(),
      },
      task: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === taskBeta.id) {
            if (where.project?.organizationId === orgBeta.id) return taskBeta;
            return null;
          }
          if (where.id === 'a0000000-0000-0000-0000-000000000501') {
            if (where.project?.organizationId === orgAlpha.id) {
              return {
                id: 'a0000000-0000-0000-0000-000000000501',
                projectId: 'proj-alpha-101',
                title: 'Alpha Task',
                version: 1,
              };
            }
          }
          // IDOR check for parent task within same project
          if (where.id === taskBeta.id && where.projectId === 'proj-alpha-101') {
            return null; // Task Beta does NOT belong to Project Alpha!
          }
          return null;
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      team: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === teamBeta.id && where.organizationId === orgBeta.id) {
            return teamBeta;
          }
          if (where.id === 'team-alpha-301' && where.organizationId === orgAlpha.id) {
            return { id: 'team-alpha-301', organizationId: orgAlpha.id, name: 'Alpha Team' };
          }
          return null;
        }),
        delete: vi.fn(),
      },
      teamMember: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      activity: { create: vi.fn().mockResolvedValue({ id: 'act-1' }) },
      job: { create: vi.fn().mockResolvedValue({ id: 'job-1' }) },
      $transaction: vi.fn().mockImplementation(async (cb) => cb({})),
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Cross-Tenant Project Access (IDOR Prevention)
  // ---------------------------------------------------------------------------
  describe('Cross-Tenant Project Isolation (IDOR Protection)', () => {
    it('prevents Org Alpha from reading Org Beta project (GET /projects/:projectId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .get(`/api/v1/projects/${projectBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents Org Alpha from modifying Org Beta project (PATCH /projects/:projectId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .patch(`/api/v1/projects/${projectBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({ name: 'Alpha Hijacked Name' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockDb.project.update).not.toHaveBeenCalled();
    });

    it('prevents Org Alpha from deleting Org Beta project (DELETE /projects/:projectId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .delete(`/api/v1/projects/${projectBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockDb.project.delete).not.toHaveBeenCalled();
    });

    it('prevents Org Alpha from reading Org Beta tasks (GET /projects/:projectId/tasks)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .get(`/api/v1/projects/${projectBeta.id}/tasks`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents Org Alpha from reading Org Beta calendar export (GET /projects/:projectId/calendar.ics)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .get(`/api/v1/projects/${projectBeta.id}/calendar.ics`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents Org Alpha from triggering webhooks for Org Beta (POST /projects/:projectId/webhooks/dispatch)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .post(`/api/v1/projects/${projectBeta.id}/webhooks/dispatch`)
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({
          targetUrl: 'https://attacker.com/webhook',
          secret: 'attacker-secret-1234',
          event: 'task.stolen',
          idempotencyKey: 'attacker-key-1',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockDb.job.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Cross-Tenant Task and Subtask Mutation (IDOR Protection)
  // ---------------------------------------------------------------------------
  describe('Cross-Tenant Task Isolation (IDOR Protection)', () => {
    it('prevents Org Alpha from updating Org Beta task (PATCH /tasks/:taskId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .patch(`/api/v1/tasks/${taskBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({ title: 'Compromised Task Title', version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockDb.task.updateMany).not.toHaveBeenCalled();
    });

    it('prevents Org Alpha from deleting Org Beta task (DELETE /tasks/:taskId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .delete(`/api/v1/tasks/${taskBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockDb.task.delete).not.toHaveBeenCalled();
    });

    it('prevents Org Alpha from adding comments to Org Beta task (POST /tasks/:taskId/comments)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .post(`/api/v1/tasks/${taskBeta.id}/comments`)
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({ body: 'Malicious Injected Comment' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents Org Alpha from viewing activity history of Org Beta task (GET /tasks/:taskId/activity)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .get(`/api/v1/tasks/${taskBeta.id}/activity`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents Org Alpha from adding subtasks to Org Beta task (POST /tasks/:taskId/subtasks)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .post(`/api/v1/tasks/${taskBeta.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({ title: 'Injected Subtask' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    // REGRESSION TEST: Fixed vulnerability on cross-tenant parentId linking in PATCH
    it('REGRESSION: rejects task PATCH specifying cross-tenant parentId (400 INVALID_PARENT_TASK)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .patch('/api/v1/tasks/a0000000-0000-0000-0000-000000000501')
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({
          title: 'Modified Alpha Task',
          version: 1,
          parentId: taskBeta.id, // Attacker tries linking to Org Beta task!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARENT_TASK');
      expect(mockDb.task.updateMany).not.toHaveBeenCalled();
    });

    it('REGRESSION: rejects self-referential parentId cycle on task PATCH (400 INVALID_PARENT_TASK)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .patch('/api/v1/tasks/a0000000-0000-0000-0000-000000000501')
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({
          title: 'Cyclic Parent Attempt',
          version: 1,
          parentId: 'a0000000-0000-0000-0000-000000000501', // Self parent cycle!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARENT_TASK');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Cross-Tenant Team and Membership Injection
  // ---------------------------------------------------------------------------
  describe('Cross-Tenant Team & Membership Isolation', () => {
    it('prevents Org Alpha from reading Org Beta team details (GET /teams/:teamId)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaMember);

      const res = await request(app)
        .get(`/api/v1/teams/${teamBeta.id}`)
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents adding user from Org Beta into Org Alpha team (USER_NOT_IN_ORGANIZATION)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAlpha = createToken(userAlphaOwner);

      const res = await request(app)
        .post('/api/v1/teams/team-alpha-301/members')
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({ userId: userBetaMember.userId }); // User belongs to Org Beta!

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('USER_NOT_IN_ORGANIZATION');
      expect(mockDb.teamMember.upsert).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Role-Based Access Control (RBAC) Enforcement
  // ---------------------------------------------------------------------------
  describe('Role-Based Access Control (RBAC) Boundary Enforcement', () => {
    it('blocks AUDITOR role from creating projects (403 FORBIDDEN)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAuditor = createToken(userAlphaAuditor);

      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenAuditor}`)
        .send({ name: 'Auditor Illegal Project' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks AUDITOR role from creating tasks (403 FORBIDDEN)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenAuditor = createToken(userAlphaAuditor);

      const res = await request(app)
        .post('/api/v1/projects/proj-alpha-101/tasks')
        .set('Authorization', `Bearer ${tokenAuditor}`)
        .send({ title: 'Auditor Illegal Task' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks MEMBER and MANAGER roles from deleting projects (requires OWNER)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );

      const tokenMember = createToken(userAlphaMember);
      const resMember = await request(app)
        .delete('/api/v1/projects/proj-alpha-101')
        .set('Authorization', `Bearer ${tokenMember}`);
      expect(resMember.status).toBe(403);
      expect(resMember.body.error.code).toBe('FORBIDDEN');

      const tokenManager = createToken({
        userId: 'u-mgr',
        organizationId: orgAlpha.id,
        role: 'MANAGER',
      });
      const resManager = await request(app)
        .delete('/api/v1/projects/proj-alpha-101')
        .set('Authorization', `Bearer ${tokenManager}`);
      expect(resManager.status).toBe(403);
      expect(resManager.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks MEMBER role from deleting tasks (requires OWNER or MANAGER)', async () => {
      const mockDb = createMockDb();
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET },
        { database: mockDb as any },
      );
      const tokenMember = createToken(userAlphaMember);

      const res = await request(app)
        .delete('/api/v1/tasks/task-alpha-501')
        .set('Authorization', `Bearer ${tokenMember}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Forged and Tampered Authentication Protections
  // ---------------------------------------------------------------------------
  describe('Authentication Signature and Identity Protection', () => {
    it('rejects forged token with manipulated organizationId', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });

      // Attacker generates token for Org Beta signed with their own key
      const forgedToken = createToken(
        { userId: 'attacker', organizationId: orgBeta.id, role: 'OWNER' },
        'attacker-secret-key-12345678901234',
      );

      const res = await request(app)
        .get(`/api/v1/projects/${projectBeta.id}`)
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired tokens (401 TOKEN_EXPIRED)', async () => {
      const app = createApp({ NODE_ENV: 'test', AUTH_SECRET: TEST_SECRET });

      // Token expired 10 minutes ago
      const expiredToken = createToken(userAlphaOwner, TEST_SECRET, -600);

      const res = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });
});
