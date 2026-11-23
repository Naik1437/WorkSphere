import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('health endpoints', () => {
  it('reports liveness without dependencies', async () => {
    const response = await request(createApp({ NODE_ENV: 'test' })).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'api' });
  });
  it('reports readiness when PostgreSQL and Redis respond', async () => {
    const app = createApp(
      { NODE_ENV: 'test' },
      { databasePing: async () => undefined, redisPing: async () => undefined },
    );
    expect((await request(app).get('/ready')).status).toBe(200);
  });
});

describe('tenant API authentication boundary', () => {
  it('rejects project access without a signed bearer token', async () => {
    const response = await request(
      createApp({ NODE_ENV: 'test', AUTH_SECRET: 'test-secret-that-is-long-enough-32' }),
    ).get('/api/v1/projects');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
