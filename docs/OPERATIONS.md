# Deployment and incident guide

## Deployment

Use a unique `POSTGRES_PASSWORD` and `AUTH_SECRET` in each environment; never commit them. Keep PostgreSQL and Redis private to the Compose network. Place the web/API services behind an HTTPS reverse proxy that terminates TLS, limits request size/rate, and forwards request IDs. Deploy migrations with `npm run migrate:deploy -w @worksphere/database` as a controlled release step, then check `/ready` on API and Analytics.

Back up PostgreSQL before each migration and test a restore into an isolated database regularly. Monitor container health, API 5xx rates, job failures, and database connection latency.

### Database Backup Procedure (A14-R06)

WorkSphere provides automated, timestamped database backup scripts that safely dump the active PostgreSQL database via Docker Compose without exposing credentials or hardcoding secrets.

- **PowerShell (Windows)**:
  ```powershell
  npm run db:backup
  # or directly:
  powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
  ```
- **Bash (Linux / macOS / CI)**:
  ```bash
  npm run db:backup:sh
  # or directly:
  bash scripts/backup-db.sh
  ```

**Key Safety Controls**:
- **Timestamped Isolation**: Dumps are saved as `backups/worksphere_${DB_NAME}_YYYYMMDD_HHMMSS.sql`.
- **Overwrite Protection**: The script verifies that the target filename does not already exist before writing.
- **Credential Protection**: Database name and user are derived from the runtime environment or `.env` without printing or echoing credentials. `pg_dump` runs inside the container without secrets exposed in process lists.
- **Integrity Validation**: Verifies exit status and ensures the output file is non-empty before reporting success. Empty or failed dumps are automatically removed.
- **Git Ignored**: The `backups/` directory and `*.sql` dumps are explicitly excluded in `.gitignore`.

### Database Restore Procedure & Automated Drill (A14-R07)

WorkSphere provides automated database restore scripts and an end-to-end restore drill orchestrator to safely verify disaster recovery without endangering the active production database.

#### Safe Restore Commands

- **Automated Restore Drill (Non-Destructive Live Verification)**:
  Executes an end-to-end drill: creates a fresh backup, provisions an isolated disposable drill database (`worksphere_drill_YYYYMMDD_HHMMSS`), restores the backup, validates schema and row-count parity across all tables, and drops the temporary database.
  ```powershell
  npm run db:restore:drill
  # or directly in Bash:
  npm run db:restore:drill:sh
  ```

- **Targeted Restore (Isolated Database)**:
  Restores a specific backup file into an isolated database:
  ```powershell
  npm run db:restore -- backups/worksphere_worksphere_20261123_140409.sql worksphere_isolated_test
  # or directly in Bash:
  npm run db:restore:sh -- backups/worksphere_worksphere_20261123_140409.sql worksphere_isolated_test
  ```

- **Production Restore (Emergency Recovery Only)**:
  Restoring into the primary production database requires the explicit `-Force` (or `--force`) switch to prevent accidental overwrites:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/restore-db.ps1 -BackupFile backups/backup.sql -TargetDb worksphere -Force
  ```

#### Safety & Integrity Guardrails (A14-R07)
- **Production Overwrite Protection**: The restore script strictly blocks restores targeting the primary active database unless `-Force` / `--force` is supplied.
- **Pre-Execution Validation**: Validates file existence and verifies file size is non-zero before contacting PostgreSQL.
- **Automated Provisioning**: Automatically creates target database (`CREATE DATABASE <target_db>`) if not present.
- **Post-Restore Integrity Validation**: Queries `information_schema.tables` and verifies that all 15 public tables and rows match the source database.
- **Clean Disposal**: Drill databases are cleanly dropped after verification, leaving the production database untouched.

## Incident drills

Full executable procedures, simulation runners, and verified incident evidence logs for drills **A15-R05 through A15-R11** are centralized in [docs/INCIDENT_DRILLS.md](file:///c:/Users/HANMANTHU/OneDrive/Documents/WorkSphere/docs/INCIDENT_DRILLS.md).

Run the incident drills anytime via:
```bash
npm run drill:incident
# or via automated Vitest test suite:
npm run test -w @worksphere/api -- test/incident-drills.test.ts
```

| Scenario              | Target Req | Detect                            | Contain and recover                                                                  | Evidence to retain                       |
| --------------------- | ---------- | --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| Database latency      | A15-R05    | `/ready` failures, slow API logs  | stop writes if saturation persists; inspect connections/query plan; restore capacity | timestamps, query plan, readiness output |
| Database failure      | A15-R06    | 503 DATABASE_UNAVAILABLE, logs    | circuit break writes, failover/restart DB, verify and restore latest backup dump      | error logs, backup dump validation logs  |
| Redis outage / worker | A15-R07    | API readiness and worker failures | pause workers; exponential backoff (2s..16s); quarantine into dead-letter at attempt 5| job IDs, retry count, dead-letter rows   |
| Duplicate job         | A15-R08    | duplicate event key               | rely on unique idempotency key; upsert deduplication; suppress duplicate dispatch    | event key and row state                  |
| Tenant access attempt | A15-R09    | 403/404 audit logs                | verify token organization and resource query scope; rotate credentials if needed     | request ID, actor/org IDs, resolution    |
| Stale task update     | A15-R10    | `409 VERSION_CONFLICT`            | reload task/activity and submit user-reviewed change                                 | task ID, versions, activity entries      |
| Email/webhook failure | A15-R11    | failed notification/job           | retry with bounded backoff then dead-letter; trigger ops alert without crashing API   | provider result and attempt count        |

## Application Monitoring and Metrics (A14-R08)

WorkSphere provides built-in, production-grade telemetry and observability endpoints designed for Prometheus, Grafana, Datadog, Kubernetes probes, and internal operations dashboards.

### 1. Monitoring Endpoints

| Endpoint | Method | Format | Description | Target Use Case |
| -------- | ------ | ------ | ----------- | --------------- |
| `/health` | GET | JSON | Lightweight liveness probe; returns `{ status: "ok", service: "api" }` without external dependencies. | Kubernetes liveness probe, Docker container healthcheck. |
| `/ready` | GET | JSON | Deep readiness probe checking active connectivity to PostgreSQL and Redis. | Kubernetes readiness probe, deployment traffic gate. |
| `/metrics` | GET | Prometheus Text / JSON | Real-time telemetry snapshot containing request counts, latencies, error rates, database/cache latency, queue health, and system memory. | Prometheus scraping, Grafana dashboards, ops scripts. |
| `/api/v1/metrics` | GET | Prometheus Text / JSON | Alias for `/metrics` under the versioned API path. | API gateway routing, internal monitoring collectors. |

#### Content Negotiation
- **Prometheus Exposition Format (Default)**: Requesting `GET /metrics` with `Accept: text/plain` (or standard Prometheus agent) returns metrics formatted per Prometheus text-based format 0.0.4.
- **Structured JSON Snapshot**: Requesting `GET /metrics` with header `Accept: application/json` or query parameter `?format=json` returns structured JSON telemetry.

### 2. Prometheus Scrape Configuration

Add the following job to your `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'worksphere-api'
    scrape_interval: 15s
    scrape_timeout: 5s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['api:4000']
```

### 3. Metrics Dictionary & Alerting Thresholds

| Metric Name | Type | Description | Healthy Value / Warning Threshold | Critical Alert Trigger |
| ----------- | ---- | ----------- | --------------------------------- | ---------------------- |
| `worksphere_http_requests_total` | Counter | Total count of completed HTTP requests | Monotonically increasing | Sudden flatline during active hours |
| `worksphere_http_requests_in_flight` | Gauge | Active requests currently being processed | 0 - 50 requests | > 100 sustained (saturation/hang) |
| `worksphere_http_requests_by_status` | Counter | Requests by status class (`2xx`, `3xx`, `4xx`, `5xx`) | `2xx` > 95% | `5xx` > 5% of total requests |
| `worksphere_http_errors_total` | Counter | Total 4xx and 5xx client and server errors | Low | Spikes in 5xx errors |
| `worksphere_http_error_rate_percentage` | Gauge | Error percentage of total processed requests | < 5.0% | > 10.0% sustained for 5 minutes |
| `worksphere_http_response_time_ms_avg` | Gauge | Average request latency in milliseconds | < 50ms | > 250ms sustained |
| `worksphere_http_response_time_ms{quantile="0.99"}` | Gauge | 99th percentile request latency (p99) | < 150ms | > 500ms |
| `worksphere_database_up` | Gauge | Database connectivity status (1 = up, 0 = down) | 1 | 0 (Database connection severed) |
| `worksphere_database_latency_ms` | Gauge | Response time for PostgreSQL ping (`SELECT 1`) | < 5ms | > 50ms (Database saturation) |
| `worksphere_redis_up` | Gauge | Redis connectivity status (1 = up, 0 = down) | 1 | 0 (Redis cache unreachable) |
| `worksphere_redis_latency_ms` | Gauge | Response time for Redis `PING` | < 2ms | > 20ms (Redis saturation) |
| `worksphere_queue_pending_jobs` | Gauge | Number of unprocessed outbox background jobs | < 100 jobs | > 500 jobs (Worker processing lag) |
| `worksphere_queue_retrying_jobs` | Gauge | Number of jobs currently in exponential retry | 0 - 10 jobs | > 50 jobs (External integration errors) |
| `worksphere_queue_dead_letter_jobs` | Gauge | Jobs moved to dead-letter queue after 5 failed attempts | 0 jobs | > 0 jobs (Requires manual inspection) |
| `worksphere_realtime_connections` | Gauge | Current active Server-Sent Event (SSE) streams | Matches active web users | Sudden drop to 0 during normal traffic |
| `process_uptime_seconds` | Counter | Node.js process uptime in seconds | Increases steadily | Unexpected reset (Container crash) |
| `nodejs_heap_size_used_bytes` | Gauge | Process heap memory consumed in bytes | < 150 MB | > 400 MB (Potential memory leak) |

### 4. Background Worker Health & Heartbeat

The background outbox worker (`apps/api/src/worker.ts`) executes transactional outbox jobs, notifications, and webhooks.
- **Heartbeat File**: The worker writes a timestamp heartbeat to `/tmp/worksphere-worker-heartbeat` on each processing iteration.
- **Container Healthcheck**: The Docker Compose service checks the heartbeat age every 10 seconds. If the worker hangs or stops iterating for > 30 seconds, the container fails its healthcheck and is automatically restarted:
  ```bash
  # Check worker heartbeat directly inside container:
  node -e "const fs=require('node:fs');const age=Date.now()-parseInt(fs.readFileSync('/tmp/worksphere-worker-heartbeat','utf8'),10);console.log('Worker heartbeat age (ms):', age);process.exit(age<30000?0:1);"
  ```
- **Queue Dead-Letter Monitoring**:
  Inspect any quarantined jobs via database query:
  ```sql
  SELECT id, type, attempts, last_error, failed_at FROM "Job" WHERE failed_at IS NOT NULL;
  ```

### 5. Security & Privacy Safeguards

- **Zero Tenant Data / PII**: Telemetry strictly records anonymous numerical aggregates, HTTP status codes, method counters, and component health.
- **No Token / Secret Exposure**: Authorization headers, passwords, HMAC signatures, JWT bodies, API keys, and connection strings are excluded from metrics.
- **Bounded Cardinality**: Metric labels only use fixed-size finite sets (`status_class="2xx"`, `method="GET"`, `quantile="0.99"`). User IDs, resource UUIDs, organization slugs, and URL query strings are never used as metric labels, completely eliminating memory leak vulnerabilities from high-cardinality label attacks.

## Deployment & Automated Rollback (A11-R06, A11-R07, A11-R08, A14-R01, A14-R02)

For complete end-to-end deployment documentation, see [docs/DEPLOYMENT.md](file:///c:/Users/HANMANTHU/OneDrive/Documents/WorkSphere/docs/DEPLOYMENT.md).

### 1. Production Caddy Reverse Proxy & TLS (A14-R02)
WorkSphere uses Caddy in `docker-compose.prod.yml` to terminate TLS automatically:
```bash
# Start full production stack with Caddy reverse proxy:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
- **TLS Configuration**: When `DOMAIN` is set (e.g. `worksphere.example.com`), Caddy automatically provisions and manages Let's Encrypt certificates.
- **Security Headers**: Injects HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- **Traffic Routing**: Transparently proxies `/api/*`, `/health`, `/ready`, `/metrics`, and `/docs` to the Node.js API, `/events` for SSE streaming without proxy buffering, and all other routes to the Next.js frontend.

### 2. Automated Rollback Runbook (A11-R08)
When a deployment fails health checks or smoke verification, invoke the automated rollback procedure:
```bash
# Bash (Linux / macOS / CI):
./scripts/rollback.sh staging

# PowerShell (Windows):
.\scripts\rollback.ps1 -Environment "staging"
```
**Safety Invariants**:
- **Zero Data Loss**: Database state is strictly preserved; no destructive tables or columns are dropped.
- **Automated Health Probing**: Polls `/ready` until containers report ready status.
- **Audit Logging**: All rollback events are appended to `logs/rollback.log`.

## Root cause template

Record impact, detection time, timeline, affected tenant IDs, direct cause, contributing controls, recovery steps, data validation, owner, and a regression test or monitoring action.
