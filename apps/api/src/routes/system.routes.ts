import { Router } from 'express';
import { openApiSpec, renderSwaggerUiHtml } from '../openapi.js';

export function createSystemRouter(dependencies: {
  dependencies?: any;
  metrics: any;
  events: any;
  authenticate: any;
}): Router {
  const router = Router();
  const { dependencies: deps, metrics, events, authenticate } = dependencies;

  // Root discovery index
  router.get('/', (_request, response) =>
    response.json({
      name: 'WorkSphere Core API',
      version: '1.0.0',
      documentation: {
        swaggerUi: '/docs',
        openApiJson: '/api/v1/openapi.json',
      },
      endpoints: {
        health: '/health',
        ready: '/ready',
        metrics: '/metrics',
        v1: '/api/v1',
        docs: '/docs',
        openapi: '/api/v1/openapi.json',
      },
    }),
  );

  router.get('/api/v1', (_request, response) =>
    response.json({ message: 'WorkSphere API foundation', version: 'v1' }),
  );

  // Liveness probe
  router.get('/health', (_request, response) =>
    response.status(200).json({ status: 'ok', service: 'api' }),
  );

  // Readiness probe
  router.get('/ready', async (_request, response) => {
    if (!deps) {
      return response
        .status(503)
        .json({ status: 'unavailable', checks: { database: 'unknown', redis: 'unknown' } });
    }
    const checks = await Promise.allSettled([deps.databasePing(), deps.redisPing()]);
    const healthy = checks.every((check) => check.status === 'fulfilled');
    return response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'unavailable',
      checks: {
        database: checks[0].status === 'fulfilled' ? 'ok' : 'unavailable',
        redis: checks[1].status === 'fulfilled' ? 'ok' : 'unavailable',
      },
    });
  });

  // Metrics telemetry
  router.get(['/metrics', '/api/v1/metrics'], async (req, res) => {
    let dbStatus: 'up' | 'down' | 'unknown' = 'unknown';
    let dbLatencyMs: number | undefined;
    let redisStatus: 'up' | 'down' | 'unknown' = 'unknown';
    let redisLatencyMs: number | undefined;

    if (deps?.databasePing) {
      const t0 = Date.now();
      try {
        await deps.databasePing();
        dbStatus = 'up';
        dbLatencyMs = Date.now() - t0;
      } catch {
        dbStatus = 'down';
      }
    }

    if (deps?.redisPing) {
      const t0 = Date.now();
      try {
        await deps.redisPing();
        redisStatus = 'up';
        redisLatencyMs = Date.now() - t0;
      } catch {
        redisStatus = 'down';
      }
    }

    let queueMetrics:
      | { pendingJobs: number; retryingJobs: number; deadLetterJobs: number }
      | undefined;
    if (deps?.database?.job?.count) {
      try {
        const [pending, retrying, deadLetter] = await Promise.all([
          deps.database.job.count({ where: { completedAt: null, failedAt: null } }),
          deps.database.job.count({
            where: { completedAt: null, failedAt: null, attempts: { gt: 0 } },
          }),
          deps.database.job.count({ where: { failedAt: { not: null } } }),
        ]);
        queueMetrics = {
          pendingJobs: pending,
          retryingJobs: retrying,
          deadLetterJobs: deadLetter,
        };
      } catch {
        // Ignore in test doubles without job table
      }
    }

    const activeConnections = events.getSubscriberCount();
    const acceptsJson =
      req.query.format === 'json' || req.header('accept')?.includes('application/json');

    const options = {
      dbStatus,
      dbLatencyMs,
      redisStatus,
      redisLatencyMs,
      queueMetrics,
      activeConnections,
    };

    if (acceptsJson) {
      return res.status(200).json(metrics.getMetricsSnapshot(options));
    }

    res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.status(200).send(metrics.toPrometheusText(options));
  });

  // Server-Sent Events real-time stream
  router.get('/api/v1/events', authenticate, (req, res) => {
    const identity = (req as any).identity;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const lastEventId =
      typeof req.header('Last-Event-ID') === 'string'
        ? req.header('Last-Event-ID')
        : typeof req.query.lastEventId === 'string'
          ? req.query.lastEventId
          : undefined;

    events.subscribe(identity.organizationId, res, lastEventId);
  });

  // OpenAPI Documentation
  router.get(['/docs', '/api/v1/docs'], (_request, response) =>
    response.type('html').send(renderSwaggerUiHtml('/api/v1/openapi.json')),
  );
  router.get('/api/v1/openapi.json', (_request, response) => response.json(openApiSpec));

  return router;
}
