import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API Documentation & OpenAPI/Swagger Specification (A13-R01, A13-R02, A13-R04)', () => {
  const app = createApp({
    NODE_ENV: 'test',
    AUTH_SECRET: 'test-secret-at-least-32-chars-long-abc',
  });

  it('serves OpenAPI 3.0.3 JSON specification with comprehensive endpoint coverage', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/json/);

    const spec = res.body;
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('WorkSphere REST API');
    expect(spec.info.version).toBe('1.0.0');

    // Security scheme
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth.type).toBe('http');
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');

    // Key Schemas
    const schemas = spec.components.schemas;
    expect(schemas.User).toBeDefined();
    expect(schemas.Organization).toBeDefined();
    expect(schemas.Team).toBeDefined();
    expect(schemas.TeamMember).toBeDefined();
    expect(schemas.Project).toBeDefined();
    expect(schemas.Task).toBeDefined();
    expect(schemas.Comment).toBeDefined();
    expect(schemas.ActivityLog).toBeDefined();
    expect(schemas.Attachment).toBeDefined();
    expect(schemas.ReminderJob).toBeDefined();
    expect(schemas.ErrorResponse).toBeDefined();

    // Endpoints verified
    const paths = spec.paths;
    expect(paths['/health']).toBeDefined();
    expect(paths['/ready']).toBeDefined();
    expect(paths['/api/v1/auth/register'].post).toBeDefined();
    expect(paths['/api/v1/auth/login'].post).toBeDefined();
    expect(paths['/api/v1/auth/refresh'].post).toBeDefined();
    expect(paths['/api/v1/auth/logout'].post).toBeDefined();
    expect(paths['/api/v1/organizations/current'].get).toBeDefined();
    expect(paths['/api/v1/organizations/current/members'].get).toBeDefined();
    expect(paths['/api/v1/organizations/current/invitations'].post).toBeDefined();
    expect(paths['/api/v1/invitations/accept'].post).toBeDefined();
    expect(paths['/api/v1/teams'].get).toBeDefined();
    expect(paths['/api/v1/teams'].post).toBeDefined();
    expect(paths['/api/v1/teams/{teamId}'].get).toBeDefined();
    expect(paths['/api/v1/teams/{teamId}'].delete).toBeDefined();
    expect(paths['/api/v1/teams/{teamId}/members'].post).toBeDefined();
    expect(paths['/api/v1/teams/{teamId}/members/{userId}'].delete).toBeDefined();
    expect(paths['/api/v1/projects'].get).toBeDefined();
    expect(paths['/api/v1/projects'].post).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}'].get).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}'].patch).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}'].delete).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}/analytics'].get).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}/milestones'].get).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}/milestones'].post).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}/tasks'].get).toBeDefined();
    expect(paths['/api/v1/projects/{projectId}/tasks'].post).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}'].patch).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}'].delete).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/subtasks'].get).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/subtasks'].post).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/comments'].post).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/activity'].get).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/attachments'].post).toBeDefined();
    expect(paths['/api/v1/tasks/{taskId}/reminders'].post).toBeDefined();

    // Verify request/response examples are present
    expect(
      paths['/api/v1/auth/register'].post.requestBody.content['application/json'].schema,
    ).toBeDefined();
    expect(
      paths['/api/v1/auth/register'].post.responses['201'].content['application/json'].example,
    ).toBeDefined();
    expect(
      paths['/api/v1/tasks/{taskId}'].patch.responses['200'].content['application/json'].example,
    ).toBeDefined();
  });

  it('serves interactive Swagger UI HTML at /docs and /api/v1/docs', async () => {
    const resDocs = await request(app).get('/docs');
    expect(resDocs.status).toBe(200);
    expect(resDocs.header['content-type']).toMatch(/text\/html/);
    expect(resDocs.text).toContain('id="swagger-ui"');
    expect(resDocs.text).toContain('/api/v1/openapi.json');
    expect(resDocs.text).toContain('SwaggerUIBundle');

    const resV1Docs = await request(app).get('/api/v1/docs');
    expect(resV1Docs.status).toBe(200);
    expect(resV1Docs.header['content-type']).toMatch(/text\/html/);
    expect(resV1Docs.text).toContain('id="swagger-ui"');
  });

  it('exposes documentation link in root discovery endpoint', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.documentation).toEqual({
      swaggerUi: '/docs',
      openApiJson: '/api/v1/openapi.json',
    });
    expect(res.body.endpoints.docs).toBe('/docs');
    expect(res.body.endpoints.openapi).toBe('/api/v1/openapi.json');
  });
});
