# WorkSphere — Deployment & Infrastructure Guide

This document details the deployment architecture, container registry publishing, staging automation, production release gating, reverse proxy TLS termination, and rollback runbooks for the WorkSphere platform.

---

## 1. Architecture & Topologies

WorkSphere employs a containerized multi-tier service topology:

```
                            [ Public Internet / Clients ]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │   Caddy Reverse Proxy (Port 80/443)   │
                      │   - Automatic TLS (Let's Encrypt)     │
                      │   - Security Headers & Compression    │
                      └───────┬───────────────────────┬───────┘
                              │                       │
                /api/*, /health, /ready, /docs        │  /* (All other routes)
                              ▼                       ▼
                  ┌──────────────────────┐  ┌──────────────────────┐
                  │    WorkSphere API    │  │    WorkSphere Web    │
                  │   Node.js Express    │  │   Next.js App Router │
                  │     (Port 4000)      │  │     (Port 3000)      │
                  └───────┬──────────────┘  └──────────────────────┘
                          │
             ┌────────────┼───────────────────────────┐
             ▼            ▼                           ▼
     ┌──────────────┐ ┌──────────────┐       ┌──────────────────┐
     │  PostgreSQL  │ │  Redis Cache │       │ Analytics Engine │
     │  (Port 5432) │ │  (Port 6379) │       │ FastAPI/Python   │
     └──────────────┘ └──────────────┘       │   (Port 8000)    │
             ▲                               └──────────────────┘
             │ (Outbox Polling)
     ┌───────┴──────┐
     │ Outbox Worker│
     │ Background   │
     └──────────────┘
```

---

## 2. Environments Overview

| Setting | Local Development | Staging Environment | Production Environment |
|---|---|---|---|
| **Compose Files** | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.prod.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| **Reverse Proxy** | Direct port mapping (3000, 4000) | Caddy with internal TLS / IP host | Caddy with Automatic Let's Encrypt HTTPS |
| **Domain** | `localhost` | `staging.worksphere.internal` | `worksphere.example.com` (FQDN) |
| **Database** | Ephemeral or local Postgres volume | Dedicated staging RDS / Postgres container | Dedicated managed Postgres (AWS RDS / HA) |
| **Image Source** | Local multi-stage Docker build | GHCR (`ghcr.io/owner/worksphere-*:latest`) | GHCR (`ghcr.io/owner/worksphere-*:vX.Y.Z`) |
| **Gating** | None | Automatic push to `main` | GitHub Environment protection & approvals |

---

## 3. Local Docker Deployment

### 3.1 Quickstart
To launch all services locally including PostgreSQL, Redis, Outbox Worker, Python Analytics, MinIO S3 storage, and Mailpit:

```bash
# 1. Copy sample environment file
cp .env.example .env

# 2. Build and launch services in background
docker compose up -d --build

# 3. Verify health status across containers
docker compose ps
```

### 3.2 Access Endpoints
* **Web UI**: [http://localhost:3000](http://localhost:3000)
* **API Foundation**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
* **Interactive OpenAPI Docs**: [http://localhost:4000/docs](http://localhost:4000/docs)
* **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)
* **API Readiness Check**: [http://localhost:4000/ready](http://localhost:4000/ready)
* **Prometheus Metrics**: [http://localhost:4000/metrics](http://localhost:4000/metrics)
* **Mailpit Web UI (captured emails)**: [http://localhost:8025](http://localhost:8025)
* **MinIO Console**: [http://localhost:9001](http://localhost:9001)

---

## 4. Container Registry Publishing (GHCR — A11-R05)

Container images are published automatically using the `.github/workflows/publish-images.yml` workflow:

### 4.1 Target Repositories
* `ghcr.io/<owner>/worksphere-api`
* `ghcr.io/<owner>/worksphere-web`
* `ghcr.io/<owner>/worksphere-analytics`

### 4.2 Tagging Conventions
* **`main` Branch Commits**: Tagged with `latest` and short commit SHA (e.g. `sha-a1b2c3d`).
* **Semantic Release Tags**: Tagged with `v1.2.3`, `1.2`, and `1` when pushing tags matching `v*.*.*`.
* **Manual Dispatch**: Custom tags provided via workflow inputs.

### 4.3 Permissions & Authentication
Publishing authenticates directly via GitHub's ephemeral `GITHUB_TOKEN` with `packages: write` permissions. No external Docker Hub credentials or static tokens are stored in the repository.

---

## 5. Automated Staging Deployment (A11-R06 & A14-R01)

Staging deployments execute automatically upon merging pull requests to `main` via `.github/workflows/deploy-staging.yml`:

### 5.1 Pipeline Steps
1. **Validation**: Runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet`.
2. **State Snapshot**: Records current deployment SHA to `.deploy-state/current_deployment.env` for rollback tracking.
3. **Database Migration**: Executes `npx prisma migrate deploy` using staging database credentials.
4. **Rolling Update**: Launches updated containers with `docker compose up -d --remove-orphans`.
5. **Readiness Probe**: Polls `http://localhost:4000/ready` for up to 60 seconds.
6. **Smoke Verification**: Executes HTTP tests against `/health` and `/api/v1`.
7. **Failure Trap**: If health checks or smoke tests fail, automatically executes `scripts/rollback.sh`.

---

## 6. Release Gating & Environment Protections (A11-R07)

Production deployments are strictly protected through GitHub Environments:

### 6.1 GitHub Environment Configuration
Navigate to **GitHub Repository > Settings > Environments**:
* Create an environment named `production`.
* Enable **Required reviewers**: Select designated engineering leads / release managers.
* Enable **Deployment branches**: Restrict deployments exclusively to `main` or release tags (`v*`).
* Define **Environment Secrets**:
  * `DATABASE_URL`: Production PostgreSQL connection string.
  * `REDIS_URL`: Production Redis cluster connection string.
  * `AUTH_SECRET`: Production 64-character cryptographic token secret.
  * `DOMAIN`: Public fully-qualified domain name (e.g. `worksphere.example.com`).

### 6.2 Manual Release Dispatch
Triggered through **GitHub Actions > Production Release Gating & Readiness**:
* Requires `release_version` input (e.g. `v1.0.0`).
* Requires explicit confirmation string `DEPLOY` to prevent accidental triggers.

---

## 7. Caddy Reverse Proxy & TLS Termination (A14-R02)

WorkSphere uses Caddy as its edge reverse proxy in `docker-compose.prod.yml`:

### 7.1 Key Features
* **Zero-Touch HTTPS**: Automatically requests and renews Let's Encrypt certificates when a public `DOMAIN` is provided.
* **Internal Routing**:
  * `/api/*` & system endpoints (`/health`, `/ready`, `/metrics`, `/docs`) route to `api:4000`.
  * `/events` routes to `api:4000` with disabled buffering (`flush_interval -1`) for Server-Sent Events.
  * All remaining requests route to Next.js `web:3000`.
* **Zero Port Leakage**: In production, services `api`, `web`, and `analytics` do not publish host ports; only Caddy ports `80` and `443` are exposed.
* **Hardened Security Headers**:
  * `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  * `X-Frame-Options: DENY`
  * `X-Content-Type-Options: nosniff`
  * `Referrer-Policy: strict-origin-when-cross-origin`
  * Strips `Server` identification banner.

---

## 8. Rollback Runbook (A11-R08)

If an issue is detected post-deployment, invoke the automated rollback procedure:

### 8.1 Linux / macOS (Bash)
```bash
# Execute automated rollback
./scripts/rollback.sh staging

# Or rollback to an explicit version/SHA
./scripts/rollback.sh staging a1b2c3d
```

### 8.2 Windows (PowerShell)
```powershell
# Execute automated rollback
.\scripts\rollback.ps1 -Environment "staging"

# Dry-run check
.\scripts\rollback.ps1 -Environment "staging" -DryRun
```

### 8.3 Rollback Invariants & Safety Guarantees
1. **Zero Data Destruction**: The rollback script never executes destructive database drops or deletes tables. Database state remains fully preserved.
2. **Readiness Verification**: Restored containers are monitored until `/ready` returns HTTP 200.
3. **Audit Trail**: Every rollback execution is appended to `logs/rollback.log` with timestamp, target SHA, and outcome.

---

## 9. Troubleshooting & Diagnostics

| Symptom | Probable Cause | Diagnostic Command | Remediation |
|---|---|---|---|
| Container fails `/ready` check | Database not accessible or migration pending | `docker compose logs api` | Verify `DATABASE_URL` connectivity and run `npm run migrate:deploy` |
| Caddy fails to provision TLS | Domain not pointing to public server IP or port 80 blocked | `docker compose logs caddy` | Ensure DNS A/AAAA records point to public host IP and port 80/443 are open |
| Worker not processing jobs | Jobs table missing or worker crashed | `docker compose logs worker` | Check worker heartbeat file and inspect outbox queue in PostgreSQL |
| SSE disconnected unexpectedly | Proxy buffering active | `curl -N -H "Authorization: Bearer <token>" http://localhost:4000/api/v1/events` | Verify `flush_interval -1` is configured in Caddyfile |
