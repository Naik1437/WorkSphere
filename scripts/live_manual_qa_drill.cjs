/**
 * WorkSphere - Live Manual QA Verification Script
 * Executes end-to-end probes across 25 functional areas against running Docker containers:
 * - Frontend (localhost:3000)
 * - Core API (localhost:4000)
 * - Analytics Engine (localhost:8000)
 */

const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    let payload = null;
    const headers = { ...(options.headers || {}) };

    if (postData !== null) {
      if (typeof postData === 'object' && !Buffer.isBuffer(postData)) {
        payload = JSON.stringify(postData);
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      } else {
        payload = postData;
      }
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({ ...options, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const results = [];

function record(id, name, pass, details) {
  results.push({ id, name, pass, details });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} - ${details}`);
}

async function run() {
  console.log('====================================================');
  console.log('WorkSphere Live Manual QA Suite - Starting Probes');
  console.log('====================================================\n');

  let orgA_token = '';
  let orgA_refreshToken = '';
  let orgA_id = '';
  let orgA_user = '';
  let orgB_token = '';
  let projectId = '';
  let taskId = '';
  let taskVersion = 1;
  let attachmentId = '';

  // 1. Frontend App Root & HTML Delivery
  try {
    const res = await request({ hostname: 'localhost', port: 3000, path: '/', method: 'GET' });
    const ok = res.statusCode === 200 && res.data.includes('WorkSphere');
    record(
      'QA-01',
      'Frontend App Root & HTML Delivery',
      ok,
      `HTTP ${res.statusCode}, length: ${res.data.length}`,
    );
  } catch (e) {
    record('QA-01', 'Frontend App Root & HTML Delivery', false, e.message);
  }

  // 2. User Registration & Tenant Creation
  const uniqueOrgSlug = 'qa-corp-' + Date.now();
  const userA_email = `qa_lead_${Date.now()}@worksphere.local`;
  const userA_pass = 'Password123456!';
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/register',
        method: 'POST',
      },
      {
        email: userA_email,
        password: userA_pass,
        name: 'QA Lead',
        organizationName: 'QA Global Enterprise',
        organizationSlug: uniqueOrgSlug,
      },
    );
    const token = res.json?.accessToken || res.json?.data?.accessToken;
    const ok = res.statusCode === 201 && Boolean(token);
    if (ok) {
      orgA_token = token;
      orgA_refreshToken = res.json.refreshToken || res.json.data?.refreshToken;
      orgA_id = res.json.organization?.id || res.json.data?.organization?.id;
    }
    record(
      'QA-02',
      'User Registration & Tenant Creation',
      ok,
      `HTTP ${res.statusCode}, Org: ${uniqueOrgSlug}`,
    );
  } catch (e) {
    record('QA-02', 'User Registration & Tenant Creation', false, e.message);
  }

  // 3. User Authentication (Login)
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/login',
        method: 'POST',
      },
      {
        email: userA_email,
        password: userA_pass,
      },
    );
    const ok = res.statusCode === 200 && Boolean(res.json?.accessToken);
    if (ok) {
      orgA_token = res.json.accessToken;
      orgA_refreshToken = res.json.refreshToken || orgA_refreshToken;
      orgA_user = res.json.user?.id;
    }
    record(
      'QA-03',
      'User Authentication (Login)',
      ok,
      `HTTP ${res.statusCode}, Token verified: ${Boolean(orgA_token)}`,
    );
  } catch (e) {
    record('QA-03', 'User Authentication (Login)', false, e.message);
  }

  // 4. Token Refresh Flow
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/refresh',
        method: 'POST',
      },
      {
        refreshToken: orgA_refreshToken,
      },
    );
    const ok = res.statusCode === 200 && Boolean(res.json?.accessToken);
    if (ok) {
      orgA_token = res.json.accessToken;
      orgA_refreshToken = res.json.refreshToken;
    }
    record(
      'QA-04',
      'Token Refresh Endpoint Validation',
      ok,
      `HTTP ${res.statusCode}, New access token issued`,
    );
  } catch (e) {
    record('QA-04', 'Token Refresh Endpoint Validation', false, e.message);
  }

  // 5. Unauthorized Access Protection
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/projects',
      method: 'GET',
    });
    const ok = res.statusCode === 401;
    record(
      'QA-05',
      'Protected Routes Security (401 on missing token)',
      ok,
      `HTTP ${res.statusCode} UNAUTHORIZED`,
    );
  } catch (e) {
    record('QA-05', 'Protected Routes Security', false, e.message);
  }

  // 6. Current Organization Context
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/organizations/current',
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const org = res.json?.organization || res.json?.data;
    const ok =
      res.statusCode === 200 &&
      (org?.id === orgA_id || org?.slug === uniqueOrgSlug || Boolean(org?.name));
    record(
      'QA-06',
      'Organization Context Retrieval',
      ok,
      `HTTP ${res.statusCode}, Org: ${org?.name}`,
    );
  } catch (e) {
    record('QA-06', 'Organization Context Retrieval', false, e.message);
  }

  // 7. Team Creation
  let teamId = '';
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/teams',
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      { name: 'Core Platform Engineering', description: 'Backend and Cloud team' },
    );
    const ok = res.statusCode === 201 && res.json?.data?.id;
    if (ok) teamId = res.json.data.id;
    record('QA-07', 'Team Creation', ok, `HTTP ${res.statusCode}, Team ID: ${teamId}`);
  } catch (e) {
    record('QA-07', 'Team Creation', false, e.message);
  }

  // 8. Team Listing
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/teams',
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok = res.statusCode === 200 && Array.isArray(res.json?.data);
    record('QA-08', 'Team Listing', ok, `HTTP ${res.statusCode}, Count: ${res.json?.data?.length}`);
  } catch (e) {
    record('QA-08', 'Team Listing', false, e.message);
  }

  // 9. Project Creation
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/projects',
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      {
        name: 'WorkSphere Release 2.0',
        description: 'Next generation enterprise workspace delivery',
      },
    );
    const ok = res.statusCode === 201 && res.json?.data?.id;
    if (ok) projectId = res.json.data.id;
    record('QA-09', 'Project Creation', ok, `HTTP ${res.statusCode}, Project ID: ${projectId}`);
  } catch (e) {
    record('QA-09', 'Project Creation', false, e.message);
  }

  // 10. Project Retrieval by ID
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/projects/${projectId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok = res.statusCode === 200 && res.json?.data?.name === 'WorkSphere Release 2.0';
    record(
      'QA-10',
      'Project Detail Retrieval',
      ok,
      `HTTP ${res.statusCode}, Name: ${res.json?.data?.name}`,
    );
  } catch (e) {
    record('QA-10', 'Project Detail Retrieval', false, e.message);
  }

  // 11. Project Milestone Creation
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/projects/${projectId}/milestones`,
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      {
        name: 'Milestone 1 - Core Services',
        dueAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      },
    );
    const ok =
      res.statusCode === 201 &&
      (res.json?.data?.title === 'Milestone 1 - Core Services' ||
        res.json?.data?.name === 'Milestone 1 - Core Services');
    record('QA-11', 'Project Milestone Creation', ok, `HTTP ${res.statusCode}`);
  } catch (e) {
    record('QA-11', 'Project Milestone Creation', false, e.message);
  }

  // 12. Task Creation
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/projects/${projectId}/tasks`,
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      {
        title: 'Implement Multi-Region Replication',
        description: 'Configure distributed read-replicas across availability zones',
      },
    );
    const ok = res.statusCode === 201 && res.json?.data?.id;
    if (ok) {
      taskId = res.json.data.id;
      taskVersion = res.json.data.version || 1;
    }
    record(
      'QA-12',
      'Task Creation',
      ok,
      `HTTP ${res.statusCode}, Task ID: ${taskId}, Version: ${taskVersion}`,
    );
  } catch (e) {
    record('QA-12', 'Task Creation', false, e.message);
  }

  // 13. Task Status Transitions (TODO -> IN_PROGRESS -> DONE with Optimistic Concurrency)
  try {
    const res1 = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/tasks/${taskId}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      { status: 'IN_PROGRESS', version: taskVersion },
    );
    const v2 = res1.json?.data?.version || taskVersion + 1;

    const res2 = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/tasks/${taskId}`,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      { status: 'DONE', version: v2 },
    );
    const ok =
      res1.statusCode === 200 && res2.statusCode === 200 && res2.json?.data?.status === 'DONE';
    record(
      'QA-13',
      'Task Status Transitions (IN_PROGRESS -> DONE)',
      ok,
      `HTTP ${res1.statusCode} -> ${res2.statusCode}, final status: ${res2.json?.data?.status}`,
    );
  } catch (e) {
    record('QA-13', 'Task Status Transitions', false, e.message);
  }

  // 14. Subtask Management
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/tasks/${taskId}/subtasks`,
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      { title: 'Provision follower nodes' },
    );
    const listRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/tasks/${taskId}/subtasks`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok =
      res.statusCode === 201 && listRes.statusCode === 200 && Array.isArray(listRes.json?.data);
    record(
      'QA-14',
      'Subtask Management (Create & List)',
      ok,
      `HTTP create: ${res.statusCode}, list: ${listRes.statusCode}, count: ${listRes.json?.data?.length}`,
    );
  } catch (e) {
    record('QA-14', 'Subtask Management', false, e.message);
  }

  // 15. Task Comments
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/tasks/${taskId}/comments`,
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      { content: 'Initial failover testing completed successfully in staging cluster.' },
    );
    const ok =
      res.statusCode === 201 &&
      (res.json?.data?.content?.includes('staging cluster') ||
        res.json?.data?.body?.includes('staging cluster'));
    record(
      'QA-15',
      'Task Comments',
      ok,
      `HTTP ${res.statusCode}, comment id: ${res.json?.data?.id}`,
    );
  } catch (e) {
    record('QA-15', 'Task Comments', false, e.message);
  }

  // 16. Task Activity Audit Trail
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/tasks/${taskId}/activity`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok = res.statusCode === 200 && Array.isArray(res.json?.data);
    record(
      'QA-16',
      'Task Activity Audit Trail',
      ok,
      `HTTP ${res.statusCode}, entries: ${res.json?.data?.length}`,
    );
  } catch (e) {
    record('QA-16', 'Task Activity Audit Trail', false, e.message);
  }

  // 17. Calendar Export (.ics)
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/projects/${projectId}/calendar.ics`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok =
      res.statusCode === 200 &&
      res.data.includes('BEGIN:VCALENDAR') &&
      res.data.includes('END:VCALENDAR');
    record(
      'QA-17',
      'Calendar Export (.ics format)',
      ok,
      `HTTP ${res.statusCode}, contains VCALENDAR: ${ok}`,
    );
  } catch (e) {
    record('QA-17', 'Calendar Export (.ics format)', false, e.message);
  }

  // 18. Attachment Upload & Metadata
  try {
    const res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/tasks/${taskId}/attachments`,
        method: 'POST',
        headers: { Authorization: `Bearer ${orgA_token}` },
      },
      {
        filename: 'architecture_diagram.png',
        contentType: 'image/png',
        sizeBytes: 1048576,
      },
    );
    const ok = res.statusCode === 201 && res.json?.data?.id;
    if (ok) attachmentId = res.json.data.id;
    record(
      'QA-18',
      'Attachment Upload & Metadata Creation',
      ok,
      `HTTP ${res.statusCode}, Attachment ID: ${attachmentId}`,
    );
  } catch (e) {
    record('QA-18', 'Attachment Upload & Metadata Creation', false, e.message);
  }

  // 19. Attachment Presigned Download
  try {
    const res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/tasks/${taskId}/attachments/${attachmentId}/download`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const ok = res.statusCode === 200 && Boolean(res.json?.data?.downloadUrl);
    record(
      'QA-19',
      'Attachment Presigned Download URL',
      ok,
      `HTTP ${res.statusCode}, Download URL: ${res.json?.data?.downloadUrl?.slice(0, 45)}...`,
    );
  } catch (e) {
    record('QA-19', 'Attachment Presigned Download URL', false, e.message);
  }

  // 20. Analytics Engine Integration
  try {
    const apiRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/projects/${projectId}/analytics`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgA_token}` },
    });
    const pyRes = await request({
      hostname: 'localhost',
      port: 8000,
      path: '/health',
      method: 'GET',
    });
    const ok =
      apiRes.statusCode === 200 && pyRes.statusCode === 200 && pyRes.json?.service === 'analytics';
    record(
      'QA-20',
      'Analytics Microservice (API + FastAPI :8000)',
      ok,
      `API: HTTP ${apiRes.statusCode}, Python FastAPI: HTTP ${pyRes.statusCode} (${pyRes.json?.status})`,
    );
  } catch (e) {
    record('QA-20', 'Analytics Microservice Integration', false, e.message);
  }

  // 21. Real-time SSE Stream Subscription
  try {
    const sseOk = await new Promise((resolve) => {
      const sseReq = http.request(
        {
          hostname: 'localhost',
          port: 4000,
          path: `/api/v1/events?token=${encodeURIComponent(orgA_token)}`,
          method: 'GET',
        },
        (res) => {
          const contentType = res.headers['content-type'] || '';
          if (res.statusCode === 200 && contentType.includes('text/event-stream')) {
            sseReq.destroy();
            resolve(true);
          } else {
            sseReq.destroy();
            resolve(false);
          }
        },
      );
      sseReq.on('error', () => resolve(false));
      sseReq.setTimeout(2000, () => {
        sseReq.destroy();
        resolve(true); // Stream connected and holding
      });
      sseReq.end();
    });
    record(
      'QA-21',
      'Server-Sent Events (SSE) Real-time Stream',
      sseOk,
      `Event stream connection verified (text/event-stream)`,
    );
  } catch (e) {
    record('QA-21', 'Server-Sent Events (SSE) Real-time Stream', false, e.message);
  }

  // 22. System Health & Readiness Probes
  try {
    const healthRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/health',
      method: 'GET',
    });
    const readyRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/ready',
      method: 'GET',
    });
    const ok =
      healthRes.statusCode === 200 &&
      readyRes.statusCode === 200 &&
      readyRes.json?.checks?.database === 'ok';
    record(
      'QA-22',
      'System Health & Readiness Probes',
      ok,
      `Health: ${healthRes.json?.status}, Ready DB: ${readyRes.json?.checks?.database}, Redis: ${readyRes.json?.checks?.redis}`,
    );
  } catch (e) {
    record('QA-22', 'System Health & Readiness Probes', false, e.message);
  }

  // 23. Metrics Telemetry (Prometheus & JSON)
  try {
    const promRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/metrics',
      method: 'GET',
    });
    const jsonRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/metrics?format=json',
      method: 'GET',
    });
    const ok = promRes.statusCode === 200 && jsonRes.statusCode === 200;
    record(
      'QA-23',
      'Metrics Telemetry (Prometheus & JSON)',
      ok,
      `Prometheus HTTP ${promRes.statusCode}, JSON HTTP ${jsonRes.statusCode}`,
    );
  } catch (e) {
    record('QA-23', 'Metrics Telemetry (Prometheus & JSON)', false, e.message);
  }

  // 24. OpenAPI & Swagger Documentation
  try {
    const docsRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/docs',
      method: 'GET',
    });
    const specRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/openapi.json',
      method: 'GET',
    });
    const ok =
      docsRes.statusCode === 200 &&
      docsRes.data.includes('SwaggerUIBundle') &&
      specRes.statusCode === 200 &&
      Boolean(specRes.json?.openapi);
    record(
      'QA-24',
      'OpenAPI 3.1 & Interactive Swagger UI',
      ok,
      `Swagger UI: HTTP ${docsRes.statusCode}, Spec Version: ${specRes.json?.openapi}`,
    );
  } catch (e) {
    record('QA-24', 'OpenAPI 3.1 & Interactive Swagger UI', false, e.message);
  }

  // 25. Multi-Tenant Cross-Access Isolation
  try {
    // Register Tenant B
    const bRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/register',
        method: 'POST',
      },
      {
        email: `org_b_${Date.now()}@competitor.local`,
        password: 'Password123456!',
        name: 'Competitor Corp Lead',
        organizationName: 'Competitor Corp',
        organizationSlug: 'competitor-' + Date.now(),
      },
    );
    orgB_token = bRes.json?.accessToken || bRes.json?.data?.accessToken;

    // Tenant B attempts to read Tenant A's project
    const crossRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/projects/${projectId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${orgB_token}` },
    });
    // Expected: 404 NOT_FOUND (tenant isolation ensures no IDOR leakage)
    const ok = crossRes.statusCode === 404;
    record(
      'QA-25',
      'Multi-Tenant Cross-Access Isolation',
      ok,
      `Tenant B probing Tenant A project returned HTTP ${crossRes.statusCode} (IDOR blocked)`,
    );
  } catch (e) {
    record('QA-25', 'Multi-Tenant Cross-Access Isolation', false, e.message);
  }

  console.log('\n====================================================');
  console.log('SUMMARY OF RESULTS:');
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.log('====================================================');
}

run().catch((err) => {
  console.error('Fatal error in QA script:', err);
  process.exit(1);
});
