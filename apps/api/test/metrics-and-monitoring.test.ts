import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { MetricsCollector } from '../src/metrics.js';
import { RealtimeBroadcaster } from '../src/events.js';
import { checkWorkerHeartbeat, recordWorkerHeartbeat } from '../src/worker.js';

describe('Metrics and Monitoring (A14-R08)', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('Health and Readiness Probes', () => {
    it('GET /health returns 200 with service name', async () => {
      const app = createApp({ NODE_ENV: 'test' });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'api' });
    });

    it('GET /ready returns 200 when all backing services are healthy', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
        },
      );
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks).toEqual({ database: 'ok', redis: 'ok' });
    });

    it('GET /ready returns 503 when database ping fails', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => {
            throw new Error('Connection refused');
          },
          redisPing: async () => undefined,
        },
      );
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unavailable');
      expect(res.body.checks.database).toBe('unavailable');
      expect(res.body.checks.redis).toBe('ok');
    });

    it('GET /ready returns 503 when dependencies are undefined', async () => {
      const app = createApp({ NODE_ENV: 'test' });
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unavailable');
    });
  });

  describe('Prometheus Metrics Exposition Format', () => {
    it('GET /metrics returns text/plain Prometheus formatted metrics by default', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      // Trigger a request to populate counters
      await request(app).get('/health');

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/plain');

      const body = res.text;
      expect(body).toContain('# HELP worksphere_http_requests_total');
      expect(body).toContain('# TYPE worksphere_http_requests_total counter');
      expect(body).toContain('worksphere_http_requests_total');
      expect(body).toContain('worksphere_http_requests_by_status{status_class="2xx"}');
      expect(body).toContain('worksphere_database_up 1');
      expect(body).toContain('worksphere_redis_up 1');
      expect(body).toContain('process_uptime_seconds');
      expect(body).toContain('process_resident_memory_bytes');
    });

    it('GET /api/v1/metrics exposes identical metrics under the versioned path', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      const res = await request(app).get('/api/v1/metrics');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/plain');
      expect(res.text).toContain('worksphere_http_requests_total');
    });
  });

  describe('Structured JSON Telemetry Snapshot', () => {
    it('GET /metrics with Accept: application/json returns structured JSON telemetry', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      await request(app).get('/health');

      const res = await request(app).get('/metrics').set('Accept', 'application/json');

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/json');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptimeSeconds');
      expect(res.body.http).toHaveProperty('totalRequests');
      expect(res.body.http).toHaveProperty('statusClasses');
      expect(res.body.http).toHaveProperty('latencyMs');
      expect(res.body.dependencies.database.status).toBe('up');
      expect(res.body.dependencies.redis.status).toBe('up');
    });

    it('GET /metrics?format=json returns structured JSON telemetry via query param', async () => {
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      const res = await request(app).get('/metrics?format=json');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/json');
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('Telemetry Tracking Accuracy', () => {
    it('tracks request counts, status codes, and error rates', async () => {
      const app = createApp(
        { NODE_ENV: 'test', AUTH_SECRET: 'test-secret-at-least-32-characters-long' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      // Perform a successful request (200)
      await request(app).get('/health');

      // Perform an unauthorized request (401)
      await request(app).get('/api/v1/projects');

      // Perform a not-found request (404)
      await request(app).get('/non-existent-route-for-testing');

      const snapshot = collector.getMetricsSnapshot();
      expect(snapshot.http.totalRequests).toBe(3);
      expect(snapshot.http.statusClasses['2xx']).toBe(1);
      expect(snapshot.http.statusClasses['4xx']).toBe(2);
      expect(snapshot.http.totalErrors).toBe(2);
      expect(snapshot.http.errorRatePercentage).toBeGreaterThan(0);
      expect(snapshot.http.methods['GET']).toBe(3);
      expect(snapshot.http.latencyMs.average).toBeGreaterThanOrEqual(0);
    });

    it('reports queue health when database mock provides job count', async () => {
      const mockDb = {
        job: {
          count: async (args: {
            where?: { failedAt?: { not?: unknown }; attempts?: { gt?: number } };
          }) => {
            if (args?.where?.failedAt?.not !== undefined) return 1; // 1 dead letter
            if (args?.where?.attempts?.gt !== undefined) return 2; // 2 retrying
            return 5; // 5 pending
          },
        },
      };

      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          database: mockDb,
          metrics: collector,
        },
      );

      const res = await request(app).get('/metrics?format=json');
      expect(res.status).toBe(200);
      expect(res.body.queue).toBeDefined();
      expect(res.body.queue.pendingJobs).toBe(5);
      expect(res.body.queue.retryingJobs).toBe(2);
      expect(res.body.queue.deadLetterJobs).toBe(1);
      expect(res.body.queue.status).toBe('degraded'); // Degraded due to dead-letter job
    });

    it('reports active real-time SSE subscriber connections', async () => {
      const events = new RealtimeBroadcaster();
      const app = createApp(
        { NODE_ENV: 'test' },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          events,
          metrics: collector,
        },
      );

      const res = await request(app).get('/metrics?format=json');
      expect(res.status).toBe(200);
      expect(res.body.realtime?.activeConnections).toBe(0);
      events.close();
    });
  });

  describe('Worker Heartbeat Verification', () => {
    const testHeartbeatFile = join(tmpdir(), `test-worker-heartbeat-${Date.now()}.txt`);

    beforeEach(() => {
      try {
        unlinkSync(testHeartbeatFile);
      } catch {
        // ignore
      }
    });

    it('reports unhealthy when heartbeat file does not exist', () => {
      const status = checkWorkerHeartbeat(30000, testHeartbeatFile);
      expect(status.healthy).toBe(false);
      expect(status.lastHeartbeatMs).toBeNull();
    });

    it('reports healthy when heartbeat file is recently updated', () => {
      recordWorkerHeartbeat(testHeartbeatFile);
      const status = checkWorkerHeartbeat(30000, testHeartbeatFile);
      expect(status.healthy).toBe(true);
      expect(status.lastHeartbeatMs).toBeTypeOf('number');
      expect(status.ageMs).toBeLessThan(5000);
    });

    it('reports unhealthy when heartbeat file is older than maxAgeMs', () => {
      const staleTimestamp = Date.now() - 40000; // 40 seconds ago
      writeFileSync(testHeartbeatFile, staleTimestamp.toString(), 'utf-8');

      const status = checkWorkerHeartbeat(30000, testHeartbeatFile);
      expect(status.healthy).toBe(false);
      expect(status.lastHeartbeatMs).toBe(staleTimestamp);
      expect(status.ageMs).toBeGreaterThanOrEqual(40000);
    });
  });

  describe('Security and Sensitive Data Isolation', () => {
    it('ensures metrics endpoints never leak secrets, tokens, or tenant PII', async () => {
      const app = createApp(
        {
          NODE_ENV: 'test',
          AUTH_SECRET: 'super-secret-hmac-key-never-to-be-leaked-1234',
        },
        {
          databasePing: async () => undefined,
          redisPing: async () => undefined,
          metrics: collector,
        },
      );

      // Perform requests containing sensitive bearer headers
      await request(app)
        .get('/api/v1/projects')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive-token-payload',
        );

      const textRes = await request(app).get('/metrics');
      const jsonRes = await request(app).get('/metrics?format=json');

      const textOutput = textRes.text;
      const jsonOutput = JSON.stringify(jsonRes.body);

      // Verify no sensitive tokens or secrets exist in the text or JSON output
      expect(textOutput).not.toContain('super-secret-hmac-key');
      expect(textOutput).not.toContain('sensitive-token-payload');
      expect(textOutput).not.toContain('Authorization');
      expect(textOutput).not.toContain('Bearer');

      expect(jsonOutput).not.toContain('super-secret-hmac-key');
      expect(jsonOutput).not.toContain('sensitive-token-payload');
      expect(jsonOutput).not.toContain('Authorization');
      expect(jsonOutput).not.toContain('Bearer');
    });
  });
});
