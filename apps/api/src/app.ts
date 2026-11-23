/* eslint-disable @typescript-eslint/no-explicit-any -- createApp accepts lightweight Prisma-compatible test doubles. */
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import type { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import { RealtimeBroadcaster } from './events.js';
import { MetricsCollector } from './metrics.js';

// Repositories (A02-R02)
import { TaskRepository } from './repositories/task.repository.js';
import { ProjectRepository } from './repositories/project.repository.js';
import { TeamRepository } from './repositories/team.repository.js';
import { OrganizationRepository } from './repositories/organization.repository.js';

// Services (A02-R02)
import { TaskService } from './services/task.service.js';
import { ProjectService } from './services/project.service.js';
import { TeamService } from './services/team.service.js';
import { AuthService } from './services/auth.service.js';

// Controllers (A02-R02)
import { TaskController } from './controllers/task.controller.js';
import { ProjectController } from './controllers/project.controller.js';
import { TeamController } from './controllers/team.controller.js';
import { AuthController } from './controllers/auth.controller.js';

// Routes (A02-R02)
import { createTaskRouter } from './routes/task.routes.js';
import { createProjectRouter } from './routes/project.routes.js';
import { createTeamRouter } from './routes/team.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createOrganizationRouter } from './routes/organization.routes.js';
import { createIntegrationRouter } from './routes/integration.routes.js';
import { createSystemRouter } from './routes/system.routes.js';

export interface Dependencies {
  databasePing: () => Promise<void>;
  redisPing: () => Promise<void>;
  database?: PrismaClient;
  authSecret?: string;
  events?: RealtimeBroadcaster;
  metrics?: MetricsCollector;
}

/**
 * WorkSphere API Application Composition Root (A02-R02)
 * Assembles modular repositories, services, controllers, and routers.
 */
export function createApp(
  config: Pick<Config, 'NODE_ENV'> &
    Partial<Pick<Config, 'AUTH_SECRET' | 'ANALYTICS_SERVICE_URL' | 'ANALYTICS_SERVICE_TOKEN'>>,
  dependencies?: Dependencies,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp());
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'Last-Event-ID'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Metrics telemetry tracking (A14-R08)
  const metrics = dependencies?.metrics ?? new MetricsCollector();
  (app as any).metrics = metrics;

  app.use((req, res, next) => {
    metrics.recordRequestStart();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      metrics.recordRequestEnd(req.method, req.path, res.statusCode, durationMs);
    });
    next();
  });

  // Request correlation ID
  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as any).requestId = requestId;
    next();
  });

  const db = dependencies?.database;
  const events = dependencies?.events ?? new RealtimeBroadcaster();
  (app as any).events = events;

  const secret =
    dependencies?.authSecret ??
    config.AUTH_SECRET ??
    'local-development-secret-change-before-deploy';

  // Authentication & Security Middleware
  const authenticate = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const authHeader = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = authHeader || queryToken;
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
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    }

    try {
      const identity = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!identity.exp || identity.exp < Math.floor(Date.now() / 1000)) {
        return res.status(401).json({ error: { code: 'TOKEN_EXPIRED' } });
      }
      (req as any).identity = identity;
      return next();
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    }
  };

  const requireDb = (_req: express.Request, res: express.Response, next: express.NextFunction) =>
    db ? next() : res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE' } });

  const requireRole =
    (roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const identity = (req as any).identity;
      if (!identity || !roles.includes(identity.role)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      }
      return next();
    };

  const middlewareBundle = { authenticate, requireDb, requireRole };

  // 1. Repositories
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);
  const teamRepo = new TeamRepository(db);
  const orgRepo = new OrganizationRepository(db);

  // 2. Services
  const taskService = new TaskService(taskRepo, events);
  const projectService = new ProjectService(projectRepo, events);
  const teamService = new TeamService(teamRepo);
  const authService = new AuthService(db, secret);

  // 3. Controllers
  const taskController = new TaskController(taskService, projectService);
  const projectController = new ProjectController(projectService);
  const teamController = new TeamController(teamService, db);
  const authController = new AuthController(authService);

  // 4. Routes
  app.use('/api/v1', createAuthRouter(authController, db, authService, requireDb));
  app.use('/api/v1', createProjectRouter(projectController, taskController, middlewareBundle));
  app.use('/api/v1', createTaskRouter(taskController, middlewareBundle));
  app.use('/api/v1', createTeamRouter(teamController, middlewareBundle));
  app.use('/api/v1', createOrganizationRouter(orgRepo, middlewareBundle));
  app.use(
    '/api/v1',
    createIntegrationRouter({
      db,
      events,
      config,
      middleware: middlewareBundle,
    }),
  );

  // System routes (health, ready, metrics, events, docs)
  app.use(
    '/',
    createSystemRouter({
      dependencies,
      metrics,
      events,
      authenticate,
    }),
  );

  // 404 Route Not Found Handler
  app.use((_request, response) =>
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );

  // Centralized Error Handling Middleware
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      console.error('SERVER_ERROR_DETAIL:', error);
      const pinoError = error as { status?: number; statusCode?: number; message?: string };
      const status = pinoError.status ?? pinoError.statusCode ?? 500;
      if (status >= 500) {
        response.status(status).json({ error: { code: 'INTERNAL_ERROR' } });
        return;
      }
      response
        .status(status)
        .json({ error: { code: 'REQUEST_ERROR', message: pinoError.message ?? 'Request failed' } });
    },
  );

  return app;
}
