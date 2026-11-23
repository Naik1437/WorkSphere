/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { CalendarEventItem, generateIcsCalendar, verifyWebhookSignature } from '../integrations.js';
import { createStorageAdapterFromEnv, StorageAdapter } from '../storage.js';
import { createBillingAdapterFromEnv, BillingAdapter, PlanTier } from '../billing.js';

export function createIntegrationRouter(dependencies: {
  db: any;
  events: any;
  config: any;
  middleware: {
    authenticate: any;
    requireDb: any;
    requireRole: (roles: string[]) => any;
  };
  storageAdapter?: StorageAdapter;
  billingAdapter?: BillingAdapter;
}): Router {
  const router = Router();
  const { db, events, config, middleware } = dependencies;
  const { authenticate, requireDb, requireRole } = middleware;
  const storage = dependencies.storageAdapter ?? createStorageAdapterFromEnv();
  const billing = dependencies.billingAdapter ?? createBillingAdapterFromEnv();

  // Calendar Export (.ics)
  router.get(
    ['/projects/:projectId/calendar.ics', '/projects/:projectId/calendar'],
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const project = await db.project.findFirst({
          where: { id: req.params.projectId, organizationId: identity.organizationId },
          include: {
            milestones: true,
            tasks: true,
          },
        });
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        const calendarItems: CalendarEventItem[] = [
          ...(project.milestones || []).map((m: any) => ({
            id: m.id,
            title: m.name ?? m.title,
            description: `Milestone for project ${project.name}`,
            startDate: m.dueAt ? new Date(m.dueAt) : new Date(project.createdAt),
            type: 'MILESTONE' as const,
            status: 'ACTIVE',
          })),
          ...(project.tasks || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            startDate: t.dueAt ? new Date(t.dueAt) : new Date(t.createdAt),
            type: 'TASK' as const,
            status: t.status,
          })),
        ];

        const icsContent = generateIcsCalendar({
          projectName: project.name,
          projectDescription: project.description,
          items: calendarItems,
        });

        const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${slug}-calendar.ics"`);
        return res.send(icsContent);
      } catch (error) {
        return next(error);
      }
    },
  );

  // Outbound Webhook Dispatch
  router.post(
    '/projects/:projectId/webhooks/dispatch',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const project = await db.project.findFirst({
          where: { id: req.params.projectId, organizationId: identity.organizationId },
        });
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        const input = z
          .object({
            targetUrl: z.string().url(),
            secret: z.string().min(8),
            event: z.string().min(1).max(64),
            payload: z.record(z.any()).default({}),
            idempotencyKey: z.string().min(1).max(128),
          })
          .safeParse(req.body);
        if (!input.success) {
          return res
            .status(400)
            .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
        }

        const job = await db.job.create({
          data: {
            idempotencyKey: input.data.idempotencyKey,
            type: 'webhook.dispatch',
            payload: {
              projectId: project.id,
              targetUrl: input.data.targetUrl,
              secret: input.data.secret,
              event: input.data.event,
              payload: input.data.payload,
            },
          },
        });

        events.publish(identity.organizationId, {
          type: 'webhook.dispatched',
          payload: {
            projectId: project.id,
            event: input.data.event,
            idempotencyKey: input.data.idempotencyKey,
          },
          actorId: identity.userId,
        });

        return res.status(202).json({ data: job, meta: { status: 'queued' } });
      } catch (error) {
        return next(error);
      }
    },
  );

  // Inbound Webhook Provider Endpoint with signature verification & deduplication
  router.post('/webhooks/:provider', requireDb, async (req, res, next) => {
    try {
      const provider = req.params.provider;
      const signature = req.header('x-webhook-signature') || '';
      const secret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';

      const valid = verifyWebhookSignature(JSON.stringify(req.body), signature, secret);
      if (!valid) {
        return res.status(401).json({ error: { code: 'INVALID_SIGNATURE' } });
      }

      const externalId = req.body.id || req.body.eventId || randomUUID();
      try {
        const event = await db.webhookEvent.create({
          data: {
            provider,
            externalId,
            eventType: req.body.type || 'webhook.received',
            payload: req.body,
          },
        });
        return res.status(200).json({ status: 'processed', eventId: event.id });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return res.status(200).json({ status: 'duplicate_ignored' });
        }
        throw err;
      }
    } catch (error) {
      return next(error);
    }
  });

  // Project Analytics Integration
  router.get('/projects/:projectId/analytics', authenticate, requireDb, async (req, res, next) => {
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
        // Fallback to internal aggregation
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
  });

  // -------------------------------------------------------------
  // Object Storage / Attachments (A08-R02)
  // -------------------------------------------------------------
  router.post('/tasks/:taskId/attachments', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const input = z
        .object({
          filename: z.string().min(1).max(255),
          contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
          sizeBytes: z.number().int().positive().max(25_000_000),
        })
        .safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
      }

      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const presignedUpload = await storage.createUpload({
        organizationId: identity.organizationId,
        taskId: task.id,
        filename: input.data.filename,
        contentType: input.data.contentType,
        sizeBytes: input.data.sizeBytes,
      });

      const attachment = await db.attachment.create({
        data: {
          ...input.data,
          taskId: task.id,
          storageKey: presignedUpload.storageKey,
        },
      });

      return res.status(201).json({
        data: attachment,
        upload: {
          uploadUrl: presignedUpload.uploadUrl,
          method: presignedUpload.method,
          headers: presignedUpload.headers,
          expiresInSeconds: presignedUpload.expiresInSeconds,
        },
        meta: { storageKey: presignedUpload.storageKey },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/tasks/:taskId/attachments', authenticate, requireDb, async (req, res, next) => {
    try {
      const identity = (req as any).identity;
      const task = await db.task.findFirst({
        where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
      });
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const attachments = await db.attachment.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ data: attachments });
    } catch (error) {
      return next(error);
    }
  });

  router.get(
    '/tasks/:taskId/attachments/:attachmentId/download',
    authenticate,
    requireDb,
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const task = await db.task.findFirst({
          where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
        });
        if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        const attachment = await db.attachment.findFirst({
          where: { id: req.params.attachmentId, taskId: task.id },
        });
        if (!attachment) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        const presignedDownload = await storage.getDownloadUrl({
          storageKey: attachment.storageKey,
        });

        return res.status(200).json({
          data: {
            downloadUrl: presignedDownload.downloadUrl,
            expiresInSeconds: presignedDownload.expiresInSeconds,
            filename: attachment.filename,
            contentType: attachment.contentType,
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.delete(
    '/tasks/:taskId/attachments/:attachmentId',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER', 'MEMBER']),
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const task = await db.task.findFirst({
          where: { id: req.params.taskId, project: { organizationId: identity.organizationId } },
        });
        if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        const attachment = await db.attachment.findFirst({
          where: { id: req.params.attachmentId, taskId: task.id },
        });
        if (!attachment) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

        await storage.deleteObject({ storageKey: attachment.storageKey });
        await db.attachment.delete({ where: { id: attachment.id } });

        return res.status(200).json({ data: { id: attachment.id, deleted: true } });
      } catch (error) {
        return next(error);
      }
    },
  );

  // -------------------------------------------------------------
  // Billing Scope / Sandbox Stripe Integration (A08-R06)
  // -------------------------------------------------------------
  router.get('/billing/plans', (_req, res) => {
    return res.status(200).json({ data: billing.getPlans() });
  });

  router.post(
    '/billing/checkout',
    authenticate,
    requireDb,
    requireRole(['OWNER']),
    async (req, res, next) => {
      try {
        const identity = (req as any).identity;
        const input = z
          .object({
            planId: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
            successUrl: z
              .string()
              .url()
              .default('http://localhost:3000/settings/billing?success=true'),
            cancelUrl: z
              .string()
              .url()
              .default('http://localhost:3000/settings/billing?cancelled=true'),
          })
          .safeParse(req.body);

        if (!input.success) {
          return res
            .status(400)
            .json({ error: { code: 'INVALID_INPUT', details: input.error.flatten() } });
        }

        const session = await billing.createCheckoutSession({
          organizationId: identity.organizationId,
          planId: input.data.planId as PlanTier,
          successUrl: input.data.successUrl,
          cancelUrl: input.data.cancelUrl,
        });

        return res.status(200).json({ data: session });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.post('/billing/webhook', requireDb, async (req, res, next) => {
    try {
      const sigHeader = req.header('stripe-signature') || '';
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const parsed = billing.verifyAndParseWebhook(rawBody, sigHeader);

      if (!parsed.valid || !parsed.event) {
        return res
          .status(401)
          .json({ error: { code: 'INVALID_SIGNATURE', message: parsed.error } });
      }

      try {
        const event = await db.webhookEvent.create({
          data: {
            provider: 'stripe',
            externalId: parsed.event.id,
            eventType: parsed.event.type,
            payload: parsed.event.data,
          },
        });
        return res
          .status(200)
          .json({ received: true, eventId: event.id, event: parsed.event.type });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return res.status(200).json({ status: 'duplicate_ignored' });
        }
        throw err;
      }
    } catch (error) {
      return next(error);
    }
  });

  // Reminders
  router.post('/tasks/:taskId/reminders', authenticate, requireDb, async (req, res, next) => {
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

      events.publish(identity.organizationId, {
        type: 'notification.reminder',
        payload: job,
        actorId: identity.userId,
      });

      return res.status(202).json({ data: job, meta: { worker: 'persistent-outbox-active' } });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
