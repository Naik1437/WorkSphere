/* eslint-disable @typescript-eslint/no-explicit-any -- createApp accepts lightweight Prisma-compatible test doubles. */
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import { hashPassword, newOpaqueToken, tokenHash, verifyPassword } from './auth.js';
import { notificationEventKey } from './jobs.js';

export interface Dependencies {
  databasePing: () => Promise<void>;
  redisPing: () => Promise<void>;
  database?: any;
  authSecret?: string;
}

export function createApp(
  config: Pick<Config, 'NODE_ENV'> &
    Partial<Pick<Config, 'AUTH_SECRET' | 'ANALYTICS_SERVICE_URL' | 'ANALYTICS_SERVICE_TOKEN'>>,
  dependencies?: Dependencies,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as any).requestId = requestId;
    next();
  });
  const db = dependencies?.database;
  const secret =
    dependencies?.authSecret ??
    config.AUTH_SECRET ??
    'local-development-secret-change-before-deploy';
  const sign = (payload: Record<string, string>, lifetimeSeconds = 900) => {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }),
    ).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  const authenticate = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    const [body, signature] = token.split('.');
    const expected = createHmac('sha256', secret)
      .update(body ?? '')
      .digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(signature ?? '', 'base64url');
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    try {
      const identity = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!identity.exp || identity.exp < Math.floor(Date.now() / 1000))
        return res.status(401).json({ error: { code: 'TOKEN_EXPIRED' } });
      (req as any).identity = identity;
      return next();
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    }
  };
  const requireDb = (_req: express.Request, res: express.Response, next: express.NextFunction) =>
    db ? next() : res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE' } });
  const projectInput = z.object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4000).optional(),
  });
  const taskInput = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
    version: z.number().int().positive().optional(),
  });
  const credentials = z.object({
    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .transform((email) => email.toLowerCase()),
    password: z.string().min(12).max(128),
  });
  const issueSession = async (userId: string, organizationId: string, role: string) => {
    const refreshToken = newOpaqueToken();
    await db.session.create({
      data: {
        userId,
        refreshTokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      },
    });
    return { accessToken: sign({ userId, organizationId, role }), refreshToken };
  };
  app.post('/api/v1/auth/register', requireDb, async (req, res, next) => {
    try {
      const input = credentials
        .extend({
          organizationName: z.string().trim().min(2).max(160),
          organizationSlug: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]{3,64}$/),
        })
        .safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      const passwordHash = await hashPassword(input.data.password);
      const result = await db.$transaction(async (tx: any) => {
        const user = await tx.user.create({ data: { email: input.data.email, passwordHash } });
        const organization = await tx.organization.create({
          data: { name: input.data.organizationName, slug: input.data.organizationSlug },
        });
        await tx.membership.create({
          data: { userId: user.id, organizationId: organization.id, role: 'OWNER' },
        });
        return { user, organization };
      });
      return res.status(201).json({
        data: {
          organization: result.organization,
          ...(await issueSession(result.user.id, result.organization.id, 'OWNER')),
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002')
        return res.status(409).json({ error: { code: 'ALREADY_EXISTS' } });
      return next(error);
    }
  });
  app.post('/api/v1/auth/login', requireDb, async (req, res, next) => {
    try {
      const input = credentials.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: { code: 'INVALID_INPUT' } });
      const user = await db.user.findUnique({
        where: { email: input.data.email },
        include: { memberships: { take: 1 } },
      });
      if (
        !user ||
        !(await verifyPassword(input.data.password, user.passwordHash)) ||
        !user.memberships[0]
      )
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } });
      const membership = user.memberships[0];
      return res.json({
        data: await issueSession(user.id, membership.organizationId, membership.role),
      });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/auth/refresh', requireDb, async (req, res, next) => {
    try {
      const input = z.object({ refreshToken: z.string().min(40).max(512) }).safeParse(req.body);
      if (!input.success) return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN' } });
      const session = await db.session.findUnique({
        where: { refreshTokenHash: tokenHash(input.data.refreshToken) },
        include: { user: { include: { memberships: { take: 1 } } } },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt < new Date() ||
        !session.user.memberships[0]
      )
        return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN' } });
      await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      const membership = session.user.memberships[0];
      return res.json({
        data: await issueSession(session.userId, membership.organizationId, membership.role),
      });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/auth/logout', authenticate, requireDb, async (req, res, next) => {
    try {
      const input = z.object({ refreshToken: z.string().min(40).max(512) }).safeParse(req.body);
      if (!input.success) return res.status(204).end();
      await db.session.updateMany({
        where: {
          userId: (req as any).identity.userId,
          refreshTokenHash: tokenHash(input.data.refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/organizations/current', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const organization = await db.organization.findUnique({
        where: { id: identity.organizationId },
      });
      if (!organization) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({
        data: organization,
        membership: { role: identity.role, userId: identity.userId },
      });
    } catch (error) {
      return next(error);
    }
  });
  app.get(
    '/api/v1/organizations/current/members',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const data = await db.membership.findMany({
          where: { organizationId: identity.organizationId },
          include: { user: { select: { id: true, email: true } } },
          orderBy: { user: { email: 'asc' } },
        });
        return res.json({ data });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.post(
    '/api/v1/organizations/current/invitations',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        if (!['OWNER', 'MANAGER'].includes(identity.role))
          return res.status(403).json({ error: { code: 'FORBIDDEN' } });
        const input = z
          .object({
            email: z
              .string()
              .email()
              .transform((value) => value.toLowerCase()),
            role: z.enum(['MANAGER', 'MEMBER', 'AUDITOR']).default('MEMBER'),
          })
          .safeParse(req.body);
        if (!input.success)
          return res
            .status(400)
            .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
        const token = newOpaqueToken();
        const invite = await db.invitation.upsert({
          where: {
            organizationId_email: {
              organizationId: identity.organizationId,
              email: input.data.email,
            },
          },
          update: {
            role: input.data.role,
            tokenHash: tokenHash(token),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            acceptedAt: null,
          },
          create: {
            ...input.data,
            organizationId: identity.organizationId,
            tokenHash: tokenHash(token),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          },
        });
        return res.status(201).json({ data: { invitation: invite, invitationToken: token } });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.post('/api/v1/invitations/accept', requireDb, async (req, res, next) => {
    try {
      const input = z
        .object({
          token: z.string().min(40),
          email: z
            .string()
            .email()
            .transform((value) => value.toLowerCase()),
        })
        .safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: { code: 'INVALID_INPUT' } });
      const invite = await db.invitation.findUnique({
        where: { tokenHash: tokenHash(input.data.token) },
      });
      if (
        !invite ||
        invite.email !== input.data.email ||
        invite.acceptedAt ||
        invite.expiresAt < new Date()
      )
        return res.status(400).json({ error: { code: 'INVALID_INVITATION' } });
      const user = await db.user.findUnique({ where: { email: input.data.email } });
      if (!user) return res.status(409).json({ error: { code: 'REGISTRATION_REQUIRED' } });
      await db.$transaction([
        db.membership.upsert({
          where: {
            organizationId_userId: { organizationId: invite.organizationId, userId: user.id },
          },
          update: { role: invite.role },
          create: { organizationId: invite.organizationId, userId: user.id, role: invite.role },
        }),
        db.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
      ]);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/auth/demo-token', (req, res) => {
    if (config.NODE_ENV !== 'test') return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const input = z
      .object({
        userId: z.string().uuid(),
        organizationId: z.string().uuid(),
        role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'AUDITOR']),
      })
      .safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
    return res.json({ accessToken: sign(input.data) });
  });
  app.get('/api/v1/projects', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const member = await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: identity.organizationId,
            userId: identity.userId,
          },
        },
      });
      if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const page = z.coerce.number().int().min(1).max(100).catch(25).parse(req.query.limit);
      const items = await db.project.findMany({
        where: { organizationId: identity.organizationId },
        orderBy: { createdAt: 'desc' },
        take: page + 1,
      });
      const nextCursor = items.length > page ? items.pop().id : null;
      return res.json({ data: items, meta: { nextCursor } });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/projects', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      if (!['OWNER', 'MANAGER'].includes(identity.role))
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const input = projectInput.safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      const project = await db.project.create({
        data: { ...input.data, organizationId: identity.organizationId },
      });
      return res.status(201).json({ data: project });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/projects/:projectId', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const project = await db.project.findFirst({
        where: { id: req.params.projectId, organizationId: identity.organizationId },
      });
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: project });
    } catch (error) {
      return next(error);
    }
  });
  app.get(
    '/api/v1/projects/:projectId/analytics',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const project = await db.project.findFirst({
          where: { id: req.params.projectId, organizationId: identity.organizationId },
          include: { tasks: true },
        });
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
        const taskSnapshots = (project.tasks ?? []).map((task: any) => {
          const cycleDays =
            task.status === 'DONE' && task.createdAt && task.updatedAt
              ? Math.max(
                  0,
                  Math.round(
                    ((new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime()) /
                      (1000 * 60 * 60 * 24)) *
                      100,
                  ) / 100,
                )
              : null;
          return {
            status: task.status,
            estimate_hours: 1,
            cycle_days: cycleDays,
            due_date: task.dueAt ? new Date(task.dueAt).toISOString().split('T')[0] : null,
          };
        });
        const analyticsUrl = config.ANALYTICS_SERVICE_URL ?? 'http://127.0.0.1:8000';
        let analyticsData: any = null;
        try {
          const headers: Record<string, string> = { 'content-type': 'application/json' };
          if (config.ANALYTICS_SERVICE_TOKEN) {
            headers['x-service-token'] = config.ANALYTICS_SERVICE_TOKEN;
          }
          const response = await fetch(`${analyticsUrl}/api/v1/analytics/projects`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tasks: taskSnapshots }),
          });
          if (response.ok) {
            analyticsData = await response.json();
          }
        } catch {
          // Graceful fallback to internal aggregation if analytics service is down
        }
        if (!analyticsData) {
          const counts: Record<string, number> = {};
          let completedCount = 0;
          for (const task of project.tasks ?? []) {
            const s = (task.status || '').toLowerCase();
            counts[s] = (counts[s] ?? 0) + 1;
            if (s === 'done') completedCount++;
          }
          const total = (project.tasks ?? []).length;
          analyticsData = {
            total_tasks: total,
            by_status: counts,
            completion_rate: total ? Math.round((completedCount / total) * 10000) / 10000 : 0,
            estimated_hours: total,
            average_cycle_days: null,
            fallback: true,
          };
        }
        return res.json({ data: analyticsData, meta: { projectId: project.id } });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.patch('/api/v1/projects/:projectId', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      if (!['OWNER', 'MANAGER'].includes(identity.role))
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const input = projectInput.partial().safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: { code: 'INVALID_INPUT' } });
      const project = await db.project.findFirst({
        where: { id: req.params.projectId, organizationId: identity.organizationId },
      });
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({
        data: await db.project.update({ where: { id: project.id }, data: input.data }),
      });
    } catch (error) {
      return next(error);
    }
  });
  app.delete('/api/v1/projects/:projectId', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      if (identity.role !== 'OWNER') return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const project = await db.project.findFirst({
        where: { id: req.params.projectId, organizationId: identity.organizationId },
      });
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      await db.project.delete({ where: { id: project.id } });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
  app.get('/api/v1/projects/:projectId/tasks', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const member = await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: identity.organizationId,
            userId: identity.userId,
          },
        },
      });
      if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const project = await db.project.findFirst({
        where: { id: req.params.projectId, organizationId: identity.organizationId },
      });
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const page = z.coerce.number().int().min(1).max(100).catch(25).parse(req.query.limit);
      const items = await db.task.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        take: page + 1,
      });
      const nextCursor = items.length > page ? items.pop().id : null;
      return res.json({ data: items, meta: { nextCursor } });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/projects/:projectId/tasks', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      if (identity.role === 'AUDITOR')
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const project = await db.project.findFirst({
        where: { id: req.params.projectId, organizationId: identity.organizationId },
      });
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const input = taskInput.safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      const task = await db.$transaction(async (tx: any) => {
        const created = await tx.task.create({ data: { ...input.data, projectId: project.id } });
        await tx.activity.create({
          data: {
            taskId: created.id,
            actorId: identity.userId,
            eventType: 'task.created',
            payload: { title: created.title },
          },
        });
        await tx.job.create({
          data: {
            idempotencyKey: notificationEventKey(created.id, 'task.created', created.version),
            type: 'notification.task-created',
            payload: { taskId: created.id, userId: identity.userId },
          },
        });
        return created;
      });
      return res.status(201).json({ data: task });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/tasks/:taskId/comments', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const input = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: { code: 'INVALID_INPUT' } });
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const comment = await db.$transaction(async (tx: any) => {
        const created = await tx.comment.create({
          data: { taskId: task.id, authorId: identity.userId, body: input.data.body },
        });
        await tx.activity.create({
          data: {
            taskId: task.id,
            actorId: identity.userId,
            eventType: 'comment.created',
            payload: { commentId: created.id },
          },
        });
        return created;
      });
      return res.status(201).json({ data: comment });
    } catch (error) {
      return next(error);
    }
  });
  app.patch('/api/v1/tasks/:taskId', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const input = taskInput
        .partial()
        .extend({ version: z.number().int().positive() })
        .safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const changed = await db.task.updateMany({
        where: { id: task.id, version: input.data.version },
        data: { ...input.data, version: { increment: 1 } },
      });
      if (!changed.count)
        return res.status(409).json({
          error: { code: 'VERSION_CONFLICT', message: 'Task changed; reload before retrying' },
        });
      const updated = await db.$transaction(async (tx: any) => {
        const record = await tx.task.findUnique({ where: { id: task.id } });
        await tx.activity.create({
          data: {
            taskId: task.id,
            actorId: identity.userId,
            eventType: 'task.updated',
            payload: { version: input.data.version + 1 },
          },
        });
        await tx.job.create({
          data: {
            idempotencyKey: notificationEventKey(task.id, 'task.updated', input.data.version + 1),
            type: 'notification.task-updated',
            payload: { taskId: task.id, userId: identity.userId },
          },
        });
        return record;
      });
      return res.json({ data: updated });
    } catch (error) {
      return next(error);
    }
  });
  app.delete('/api/v1/tasks/:taskId', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      if (!['OWNER', 'MANAGER'].includes(identity.role))
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      await db.task.delete({ where: { id: task.id } });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
  app.post(
    '/api/v1/projects/:projectId/milestones',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        if (!['OWNER', 'MANAGER'].includes(identity.role))
          return res.status(403).json({ error: { code: 'FORBIDDEN' } });
        const project = await db.project.findFirst({
          where: { id: req.params.projectId, organizationId: identity.organizationId },
        });
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
        const input = z
          .object({
            name: z.string().trim().min(1).max(160),
            dueAt: z.string().datetime().optional(),
          })
          .safeParse(req.body);
        if (!input.success)
          return res
            .status(400)
            .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
        const milestone = await db.milestone.create({
          data: {
            ...input.data,
            dueAt: input.data.dueAt ? new Date(input.data.dueAt) : undefined,
            projectId: project.id,
          },
        });
        return res.status(201).json({ data: milestone });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.get(
    '/api/v1/projects/:projectId/milestones',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const project = await db.project.findFirst({
          where: { id: req.params.projectId, organizationId: identity.organizationId },
        });
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
        return res.json({
          data: await db.milestone.findMany({
            where: { projectId: project.id },
            orderBy: { dueAt: 'asc' },
          }),
        });
      } catch (error) {
        return next(error);
      }
    },
  );
  app.get('/api/v1/tasks/:taskId/activity', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({
        data: await db.activity.findMany({
          where: { taskId: task.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/tasks/:taskId/attachments', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const input = z
        .object({
          filename: z.string().min(1).max(255),
          contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
          sizeBytes: z.number().int().positive().max(25_000_000),
        })
        .safeParse(req.body);
      if (!input.success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const attachment = await db.attachment.create({
        data: {
          ...input.data,
          taskId: task.id,
          storageKey: `demo/${identity.organizationId}/${task.id}/${randomUUID()}-${input.data.filename}`,
        },
      });
      return res.status(201).json({ data: attachment, meta: { storage: 'demo-metadata-only' } });
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/v1/tasks/:taskId/reminders', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const input = z
        .object({ idempotencyKey: z.string().uuid(), deliverAt: z.string().datetime() })
        .safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: { code: 'INVALID_INPUT' } });
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      const job = await db.job.upsert({
        where: { idempotencyKey: input.data.idempotencyKey },
        update: {},
        create: {
          idempotencyKey: input.data.idempotencyKey,
          type: 'notification.reminder',
          payload: { taskId: task.id, userId: identity.userId },
          availableAt: new Date(input.data.deliverAt),
        },
      });
      return res
        .status(202)
        .json({ data: job, meta: { worker: 'persistent-outbox-active' } });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/', (_request, response) =>
    response.status(200).json({
      name: 'WorkSphere API',
      status: 'ok',
      version: 'v1',
      documentation: '/api/v1/openapi.json',
      endpoints: {
        health: '/health',
        ready: '/ready',
        v1: '/api/v1',
      },
    }),
  );
  app.get('/health', (_request, response) =>
    response.status(200).json({ status: 'ok', service: 'api' }),
  );
  app.get('/ready', async (_request, response) => {
    if (!dependencies)
      return response
        .status(503)
        .json({ status: 'unavailable', checks: { database: 'unknown', redis: 'unknown' } });
    const checks = await Promise.allSettled([
      dependencies.databasePing(),
      dependencies.redisPing(),
    ]);
    const healthy = checks.every((check) => check.status === 'fulfilled');
    return response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'unavailable',
      checks: {
        database: checks[0].status === 'fulfilled' ? 'ok' : 'unavailable',
        redis: checks[1].status === 'fulfilled' ? 'ok' : 'unavailable',
      },
    });
  });
  app.get('/api/v1', (_request, response) =>
    response.json({ message: 'WorkSphere API foundation', version: 'v1' }),
  );
  app.get('/api/v1/openapi.json', (_request, response) =>
    response.json({
      openapi: '3.0.3',
      info: { title: 'WorkSphere API', version: 'v1' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT-like HMAC token' },
        },
        responses: {
          Unauthorized: { description: 'Missing, invalid, or expired token' },
          Conflict: { description: 'Optimistic concurrency conflict' },
        },
      },
      paths: {
        '/auth/register': { post: { summary: 'Register a user and owner organization' } },
        '/auth/login': { post: { summary: 'Start a local credential session' } },
        '/projects': {
          get: { security: [{ bearerAuth: [] }], summary: 'List organization projects' },
          post: { security: [{ bearerAuth: [] }], summary: 'Create project' },
        },
        '/projects/{projectId}/tasks': {
          get: { security: [{ bearerAuth: [] }], summary: 'List project tasks' },
          post: { security: [{ bearerAuth: [] }], summary: 'Create task' },
        },
        '/tasks/{taskId}': {
          patch: { security: [{ bearerAuth: [] }], summary: 'Update task with version' },
          delete: { security: [{ bearerAuth: [] }], summary: 'Delete task' },
        },
      },
    }),
  );
  app.use((_request, response) =>
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      console.error('API request failed', error instanceof Error ? error.message : 'unknown error');
      return response
        .status(500)
        .json({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed' } });
    },
  );
  return app;
}
