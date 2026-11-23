# WorkSphere Operational Incident Response Drills & Evidence Log

This document records the incident response drills, simulation procedures, recovery runbooks, and captured execution evidence for **Assessment 15 (A15-R05 through A15-R11)**.

---

## 1. Executive Summary & Drill Methodology

WorkSphere operational reliability relies on defense-in-depth principles:

- **Zero Silent Data Loss**: Optimistic locking (`version` field) prevents race conditions and concurrent write collisions.
- **Fail-Fast Readiness Probing**: `/ready` actively checks PostgreSQL and Redis; failures trigger immediate traffic shedding while `/health` preserves container liveness.
- **Circuit-Breaker Degradation**: Missing database connections fail fast with HTTP 503 `DATABASE_UNAVAILABLE` rather than unhandled rejections or crashes.
- **Guaranteed At-Least-Once Asynchronous Processing**: Persistent outbox pattern (`jobs` table) with exponential backoff ($2^\text{attempts}$) and quarantined dead-lettering after 5 attempts.
- **Strict Multi-Tenant Isolation**: Server-side scoping on `organizationId` enforced at the query level for all data access.

### Drill Execution Commands

```bash
# Execute standalone incident drills runner
npm run drill:incident
# or directly:
node scripts/run-incident-drills.mjs

# Execute automated Vitest test suite for incident drills
npm run test -w @worksphere/api -- test/incident-drills.test.ts
```

---

## 2. Incident Response Drills (A15-R05 through A15-R11)

### Drill A15-R05: Service Outage / API Latency & Probe Readiness

- **Requirement**: A15-R05 — API service degradation and readiness probe behavior during database saturation.
- **Scenario**: Database connection pool saturation or query latency exceeding acceptable thresholds (> 5,000ms).
- **Trigger**: Simulated database timeout in the `/ready` probe.
- **Detection**:
  - `/ready` probe returns `HTTP 503 Service Unavailable` with payload `{"status":"unavailable","checks":{"database":"unavailable","redis":"ok"}}`.
  - Ingress controller / load balancer immediately removes the degraded API instance from the active routing pool.
  - `/health` probe returns `HTTP 200 OK` (`{"status":"ok","service":"api"}`), ensuring container orchestrators (Docker / Kubernetes) do not enter crash-restart loops during transient dependency saturation.
- **Containment & Recovery**:
  1. Inspect connection pool saturation via `pg_stat_activity`.
  2. Shed non-critical traffic; queue writes if necessary.
  3. Once query latency normalizes (< 200ms), `/ready` automatically returns `HTTP 200 OK` and traffic resumes.
- **Captured Drill Evidence**:
  - Status: **PASSED** (0ms execution, verified in `test/incident-drills.test.ts` and `scripts/run-incident-drills.mjs`).

---

### Drill A15-R06: Database Failure & Safe Backup Verification

- **Requirement**: A15-R06 — Database connection loss circuit breaking and backup recovery procedure.
- **Scenario**: Primary PostgreSQL container unreachable or abruptly terminated.
- **Trigger**: Inbound write request received while the database connection is offline.
- **Detection**:
  - API middleware `requireDb` detects missing connection and rejects the write with `HTTP 503` and `error.code = 'DATABASE_UNAVAILABLE'`.
  - Process remains stable without crashing or leaking unhandled promise rejections.
- **Containment & Recovery**:
  1. Failover to replica or restart PostgreSQL container via `docker compose up -d postgres`.
  2. If data corruption occurred, execute the backup recovery protocol using the latest timestamped dump created by `scripts/backup-db.ps1` or `scripts/backup-db.sh`.
  3. Validate dump integrity before restoring: verify non-empty file size and SQL syntax validity.
- **Captured Drill Evidence**:
  - Status: **PASSED** (2ms execution; write endpoints return 503 circuit-breaker; backup scripts verified present and executable).

---

### Drill A15-R07: Worker / Message Queue Failure (Redis Outage & Dead-Lettering)

- **Requirement**: A15-R07 — Background queue failure, exponential backoff, and dead-letter quarantine.
- **Scenario**: Redis message broker offline or background outbox worker fails to deliver notifications.
- **Trigger**: Worker encounters network drop or dependency connection refused.
- **Detection**:
  - Worker captures error and records failure in `job.lastError`.
  - Job status remains unacknowledged; retry scheduled with deterministic exponential backoff:
    - Attempt 1: 2s delay
    - Attempt 2: 4s delay
    - Attempt 3: 8s delay
    - Attempt 4: 16s delay
    - Attempt 5: Dead-letter quarantine (`deadLetter: true`, `failedAt` populated).
- **Containment & Recovery**:
  1. Dead-lettered jobs are quarantined in the `jobs` table without crashing the worker process loop.
  2. Once Redis/network recovers, operators inspect `jobs` where `failedAt IS NOT NULL`.
  3. Re-queue recovered jobs by clearing `failedAt` and resetting `attempts = 0`.
- **Captured Drill Evidence**:
  - Status: **PASSED** (Deterministic backoff verified; dead-lettering verified at 5th attempt).

---

### Drill A15-R08: Duplicate Job & Event Idempotency

- **Requirement**: A15-R08 — Protection against duplicate event processing and retry storms.
- **Scenario**: Network timeout causes upstream service to retry webhook dispatch or outbox delivery with the same event payload.
- **Trigger**: Duplicate submission of identical `idempotencyKey`.
- **Detection**:
  - Outbox jobs and webhook dispatches generate deterministic versioned keys via `notificationEventKey(taskId, eventType, version)`.
  - Inbound reminder requests check unique `idempotencyKey` via `db.job.upsert`.
  - Secondary invocation detects existing key, updates nothing, and returns existing job record with `HTTP 202 Accepted` instead of creating duplicate records.
- **Containment & Recovery**:
  - Zero duplicate emails sent; zero duplicate database mutations.
- **Captured Drill Evidence**:
  - Status: **PASSED** (Unique idempotency key matched; no duplicate DB rows created).

---

### Drill A15-R09: Security Incident / Cross-Tenant Access Attempt

- **Requirement**: A15-R09 — Multi-tenant boundary enforcement and unauthorized cross-tenant IDOR attack detection.
- **Scenario**: Malicious or compromised user in Organization Alpha attempts to access or modify confidential projects/tasks belonging to Organization Beta.
- **Trigger**: Request with valid bearer token for Organization Alpha targeting resource ID of Organization Beta (`GET /api/v1/projects/:projIdBeta`).
- **Detection**:
  - Server-side query enforces `{ id: req.params.projectId, organizationId: req.identity.organizationId }`.
  - Project is not found in the requester's tenant boundary, returning `HTTP 404 NOT_FOUND` (or `HTTP 403 FORBIDDEN` on unauthorized org actions).
  - Security audit entry emitted with `requestId`, `actorId`, `organizationId`, and target resource ID.
- **Containment & Recovery**:
  1. Revoke access tokens if compromised via session invalidation.
  2. Review tenant audit logs to determine if probe was automated scanning or credential compromise.
  3. Zero data leakage confirmed.
- **Captured Drill Evidence**:
  - Status: **PASSED** (Strict 404 response; repository returned null; forged tokens rejected with 401).

---

### Drill A15-R10: Concurrency Conflict / Stale Task Update Collision

- **Requirement**: A15-R10 — Capstone Challenge: Two users concurrently update the same task without silent overwrite.
- **Scenario**: User 1 and User 2 open Task version 1. Both submit updates at the same time.
- **Trigger**: Concurrent PATCH requests to `/api/v1/tasks/:taskId` with `version: 1`.
- **Detection**:
  - User 1's request commits first: atomic `updateMany` updates fields, increments version to 2, and logs activity.
  - User 2's request arrives with expected `version: 1`: `updateMany` finds 0 matching rows (`count === 0`).
  - Backend halts transaction and returns `HTTP 409 Conflict` with error code `VERSION_CONFLICT` and message `"Task changed; reload before retrying"`.
- **Containment & Recovery**:
  1. User 2's frontend receives 409 and prompts user to reload the task to view User 1's changes.
  2. Activity log preserves complete sequential audit trail with zero overwritten changes.
- **Captured Drill Evidence**:
  - Status: **PASSED** (HTTP 409 returned; task version preserved at 2; transaction safely aborted).

---

### Drill A15-R11: External Dependency / Communication & Alert Response

- **Requirement**: A15-R11 — External webhook/email service outage handling and incident escalation.
- **Scenario**: External webhook receiver or SMTP gateway returns `HTTP 500` / Connection Refused.
- **Trigger**: Webhook adapter throws an error during job execution.
- **Detection**:
  - Worker catches error, logs structured failure event, schedules retry with exponential backoff, and notifies incident monitoring channel.
  - Main synchronous user request remains unaffected (asynchronous decoupling).
- **Containment & Recovery**:
  1. Operator receives alert with failing endpoint URL, error code, and job ID.
  2. If external receiver remains down, worker safely dead-letters after 5 attempts without system disruption.
- **Captured Drill Evidence**:
  - Status: **PASSED** (Async error captured, worker loop unblocked, backoff retry scheduled).

---

## 3. Incident Drills Summary Log

| Drill ID    | Scenario                               | Target Requirement | Status     | Verification Mechanism |
| ----------- | -------------------------------------- | ------------------ | ---------- | ---------------------- |
| **A15-R05** | Service Outage & Probe Readiness       | A15-R05            | **PASSED** | Vitest + Drill Runner  |
| **A15-R06** | Database Failure & Safe Recovery       | A15-R06            | **PASSED** | Vitest + Script Check  |
| **A15-R07** | Worker Failure & Dead-Lettering        | A15-R07            | **PASSED** | Vitest + Drill Runner  |
| **A15-R08** | Duplicate Job & Event Idempotency      | A15-R08            | **PASSED** | Vitest + Drill Runner  |
| **A15-R09** | Cross-Tenant Access Incident           | A15-R09            | **PASSED** | Vitest + Drill Runner  |
| **A15-R10** | Concurrency Conflict & Stale Collision | A15-R10            | **PASSED** | Vitest + Drill Runner  |
| **A15-R11** | External Dependency & Alert Response   | A15-R11            | **PASSED** | Vitest + Drill Runner  |

---

## 4. Root Cause Analysis (RCA) Post-Incident Template

When an operational incident occurs, the following post-incident review must be completed:

```markdown
# Incident Post-Mortem: [INCIDENT-ID]

## Summary

- **Date / Time**: YYYY-MM-DD HH:MM UTC
- **Duration**: [X] minutes
- **Severity**: P1 (Critical) / P2 (Major) / P3 (Minor)
- **Impacted Tenants**: [Tenant IDs / All]
- **Services Affected**: [API / Database / Redis / Worker / Web]

## Root Cause

[Detailed description of what caused the failure, including trigger conditions, code paths, or environmental factors.]

## Detection & Response Timeline

- **HH:MM**: Incident triggered.
- **HH:MM**: Alert fired (Readiness probe failure / Error budget alert).
- **HH:MM**: Incident commander assigned.
- **HH:MM**: Mitigation deployed (Traffic shed / container restart / rollback).
- **HH:MM**: Full service restoration verified.

## Corrective Actions & Prevention

1. [Action item with owner and target completion date]
2. [Regression test added to test suite]
3. [Monitoring alert threshold adjustment]
```
