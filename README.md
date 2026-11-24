# WorkSphere

> Enterprise Multi-Tenant Project Management & Workflow Automation Platform

WorkSphere is a multi-tenant SaaS application built for modern engineering and operations teams. It provides tenant-isolated project and task management, role-based access control, hierarchical subtasks, real-time updates via Server-Sent Events (SSE), an asynchronous background outbox worker with dead-letter queueing, and a dedicated Python FastAPI analytics microservice.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   Browser / Client (SPA)    |
                      |   Next.js 15 (App Router)   |
                      |   React 19 + Tailwind CSS   |
                      +--------------+--------------+
                                     |
                     HTTP / REST     |   SSE Stream (/api/v1/events)
                                     v
                      +-----------------------------+
                      |      Primary REST API       |
                      |    Node.js 22 + Express 4   |
                      |   Modular Clean Architecture|
                      |   (Routes/Controllers/Svcs) |
                      +-------+-------------+-------+
                              |             |
            Internal RPC      |             |   Tenant Queries
            (X-Service-Token) |             v
                              |      +---------------+
                              |      |  PostgreSQL   |
                              |      |  15 Tables    |
                              |      |  Prisma ORM   |
                              v      +---------------+
             +--------------------+         |
             | Analytics Service  |         | Jobs Outbox
             | Python 3.13 FastAPI|         v
             | Streaming Metrics  |  +---------------+
             +--------------------+  | Outbox Worker |
                              |      | Node.js Loop  |
                              |      +---------------+
                              |             |
                              v             v
                      +-----------------------------+
                      |      Redis 7 (Pub/Sub)      |
                      |     Event Bus & Caching     |
                      +-----------------------------+
```

### Key Technical Components

- **Frontend (`apps/web`)**: Next.js 15 App Router (`next: ^15.1.0`, `react: ^19.0.0`) with role-tailored workspace layouts (`/admin`, `/manager`, `/member`), TanStack React Query v5 hooks, optimistic status updates, Server-Sent Events (SSE) live updates, and accessible UI components.
- **Backend API (`apps/api`)**: Node.js 22 and Express 4 (`express: ^4.21.2`, TypeScript `^5.7.2`) in a modular 4-tier architecture (`routes/`, `controllers/`, `services/`, `repositories/`), Zod input validation, correlation IDs (`x-request-id`), optimistic concurrency control (`version` check with HTTP 409 conflict handling), and OpenAPI 3.0 documentation.
- **Database (`packages/database`)**: PostgreSQL 16 (`postgres:16-alpine`) managed via Prisma ORM (`@prisma/client: ^6.1.0`) with 15 normalized tables, strict tenant isolation (`organizationId`), composite indexes, foreign key cascades, and transactional migrations.
- **Analytics Microservice (`apps/analytics`)**: FastAPI (`0.115.6`, Python 3.13) providing memory-efficient streaming CSV export generation, project completion metrics, cycle-time calculations, and service-token authentication.
- **Background Worker (`apps/api/src/worker.ts`)**: Persistent outbox worker loop processing asynchronous jobs, exponential backoff retries, dead-letter recovery, and database migration resilience.
- **Real-Time Streaming**: Server-Sent Events (`/api/v1/events`) delivering tenant-scoped domain events (tasks, projects, milestones, invitations).

---

## Technology Stack

| Layer                | Technologies & Exact Versions                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| **Frontend**         | Next.js 15 (`15.1.0`), React 19 (`19.0.0`), Tailwind CSS (`3.4.16`), TanStack React Query (`5.62.11`)  |
| **Backend API**      | Node.js 22, Express 4 (`4.21.2`), TypeScript (`5.7.2`), Zod (`3.24.1`), Pino HTTP (`10.3.0`)           |
| **Microservices**    | Python 3.13, FastAPI (`0.115.6`), Pydantic (`2.10.3`), Uvicorn (`0.34.0`)                              |
| **Database & Cache** | PostgreSQL 16 Alpine, Redis 7 Alpine, Prisma ORM (`6.1.0`)                                             |
| **DevOps & Infra**   | Docker Compose v2, Multi-stage Dockerfiles, Non-root containers, Caddy 2                               |
| **CI / CD**          | GitHub Actions (Quality, Docker Build, GHCR Publish, Staging Validation)                               |
| **Testing**          | Vitest (`2.1.8` / `5.1.1`), React Testing Library (`16.3.3`), Pytest (`8.3.4`), Playwright scaffolding |

---

## Implementation Status & Functionality Breakdown

The platform distinguishes between fully implemented and verified functionality, locally simulated architecture, and unverified/deferred external components:

### 1. Implemented & Verified Functionality

- **Multi-Tenant Authentication & RBAC**: Organization-scoped boundary enforced on database queries; password hashing with `crypto.scrypt` (unique salt, constant-time verification); dual-token authentication (short-lived HMAC access tokens and rotating SHA-256 hashed refresh tokens); role-based authorization (`OWNER`, `MANAGER`, `MEMBER`, `AUDITOR`).
- **Domain REST APIs**: Versioned endpoints under `/api/v1/` for organizations, invitations, teams, team members, projects, milestones, tasks, subtasks, comments, activity logs, reminders, and attachments.
- **Hierarchical Subtasks**: Self-referential `parentTaskId` hierarchy on tasks with parent-child relationship integrity and cycle prevention.
- **Optimistic Concurrency Control**: Monotonically increasing task `version` field returning HTTP 409 `VERSION_CONFLICT` on stale writes, with automatic UI recovery handling.
- **Real-Time Updates**: Server-Sent Events (`GET /api/v1/events`) delivering tenant-scoped domain events to frontend subscribers.
- **Outbox Worker**: Asynchronous job loop processing outbox events with exponential backoff retries, idempotency key tracking, and dead-letter queueing.
- **FastAPI Analytics Microservice**: Validated endpoints calculating workload distributions, completion rates, total estimated hours, and average cycle times; memory-efficient streaming CSV exports.
- **Docker Compose Orchestration**: 7 coordinated services with pre-flight migration synchronization (`migration: condition: service_completed_successfully`), persistent named volumes, and private network isolation.

### 2. Simulated & Scaffolded Functionality

- **Production Deployment Configuration**: Production environment simulated locally via `docker-compose.prod.yml` and Caddy 2 reverse proxy configuration template.
- **Database Backup & Restore Automation**: Backup and restore scripts (`scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/run-restore-drill.sh`) provide automated execution logic and safety guards. CI automated tests (`database-restore-drill.test.ts`) verify script existence, safety guards (preventing primary database overwrite without `--force`), and SQL schema structure via a deterministic fixture; live backup/restore execution against an active PostgreSQL instance is run via host/container scripts.
- **Third-Party Adapters**: Pluggable email interface implemented with a functional console adapter (`ConsoleEmailAdapter`); billing and quota models documented in architectural specification (`docs/BILLING_ARCHITECTURE.md`).
- **End-to-End Scaffolding**: Playwright configuration and test specs (`apps/web/e2e/auth-and-navigation.spec.ts`) scaffolded for browser automation.

### 3. Unverified & Deferred Scope

- **Live Cloud Production Hosting**: Public domain hosting, external DNS routing, and managed cloud infrastructure are not verified in this repository.
- **Live Staging Deployment**: Staging deployment workflow validates Compose configurations and rollback automation, but live deployment execution was skipped because staging target deployment configuration (`STAGING_DATABASE_URL`) was unavailable in repository secrets.
- **External Third-Party Services**: Live external SMTP relays, cloud S3 object storage endpoints, and external payment gateway webhooks were not configured.

---

## Getting Started

### Prerequisites

- **Node.js**: v22.x or later and **npm**: v10.x or later
- **Python**: v3.13 or later (or v3.11+)
- **Docker Desktop**: Compose v2 enabled

### Local Docker Startup (Recommended)

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Naik1437/WorkSphere.git
   cd WorkSphere
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env to set your secure local passwords and secrets:
   # POSTGRES_PASSWORD=your_secure_password
   # AUTH_SECRET=your_32_character_secret_key_here
   # ANALYTICS_SERVICE_TOKEN=your_analytics_service_token
   ```

3. **Start all services**:

   ```bash
   docker compose up --build
   ```

   Docker Compose automatically starts and coordinates 7 services:
   - `postgres`: PostgreSQL 16 database (port 5432, private network)
   - `redis`: Redis 7 cache & pub/sub (port 6379, private network)
   - `migration`: Executes `prisma migrate deploy` on startup and exits cleanly
   - `api`: Node.js Express REST API (`http://localhost:4000`)
   - `worker`: Background outbox job worker
   - `analytics`: FastAPI Analytics microservice (`http://localhost:8000`)
   - `web`: Next.js 15 Frontend UI (`http://localhost:3000`)

4. **Verify container health**:
   ```bash
   docker compose ps
   curl http://localhost:4000/health
   curl http://localhost:8000/health
   ```

---

## API Documentation & Endpoints

| Service       | Endpoint                                         | Description                                                |
| ------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **API**       | `GET /`                                          | Root service discovery, metadata, and routing index        |
| **API**       | `GET /health`                                    | Liveness probe returning process status and uptime         |
| **API**       | `GET /ready`                                     | Readiness probe checking PostgreSQL and Redis connectivity |
| **API**       | `GET /api/v1/openapi.json`                       | OpenAPI 3.0.3 specification covering all routes            |
| **API**       | `GET /api/v1/events`                             | Real-time Server-Sent Events (SSE) stream                  |
| **API**       | `POST /api/v1/auth/register`                     | Organization & owner account registration                  |
| **API**       | `POST /api/v1/auth/login`                        | Authentication returning access & refresh tokens           |
| **API**       | `POST /api/v1/auth/refresh`                      | Rotate refresh token and obtain new access token           |
| **API**       | `POST /api/v1/auth/logout`                       | Revoke active refresh token session                        |
| **API**       | `GET /api/v1/organizations/current`              | Retrieve active organization metadata                      |
| **API**       | `GET /api/v1/organizations/current/members`      | List organization members and roles                        |
| **API**       | `POST /api/v1/organizations/current/invitations` | Issue organization membership invitation                   |
| **API**       | `POST /api/v1/invitations/accept`                | Accept membership invitation using token                   |
| **API**       | `GET /api/v1/teams`                              | List tenant teams and member assignments                   |
| **API**       | `POST /api/v1/teams`                             | Create new team within organization                        |
| **API**       | `POST /api/v1/teams/:teamId/members`             | Add user to team                                           |
| **API**       | `GET /api/v1/projects`                           | List tenant-scoped projects                                |
| **API**       | `POST /api/v1/projects`                          | Create new project                                         |
| **API**       | `GET /api/v1/projects/:projectId`                | Retrieve project details                                   |
| **API**       | `PATCH /api/v1/projects/:projectId`              | Update project metadata                                    |
| **API**       | `DELETE /api/v1/projects/:projectId`             | Delete project (role-gated: OWNER/MANAGER)                 |
| **API**       | `GET /api/v1/projects/:projectId/tasks`          | List tasks with filters and subtasks                       |
| **API**       | `POST /api/v1/projects/:projectId/tasks`         | Create task with optional parentTaskId                     |
| **API**       | `GET /api/v1/tasks/:taskId`                      | Retrieve task details with comments and subtasks           |
| **API**       | `PATCH /api/v1/tasks/:taskId`                    | Update task with optimistic version check                  |
| **API**       | `DELETE /api/v1/tasks/:taskId`                   | Delete task                                                |
| **API**       | `GET /api/v1/projects/:projectId/milestones`     | List project milestones                                    |
| **API**       | `POST /api/v1/projects/:projectId/milestones`    | Create milestone                                           |
| **API**       | `GET /api/v1/tasks/:taskId/comments`             | List task comments                                         |
| **API**       | `POST /api/v1/tasks/:taskId/comments`            | Add comment to task                                        |
| **API**       | `GET /api/v1/tasks/:taskId/activity`             | Retrieve task activity audit trail                         |
| **API**       | `POST /api/v1/tasks/:taskId/reminders`           | Schedule task reminder outbox job                          |
| **API**       | `POST /api/v1/tasks/:taskId/attachments`         | Register task attachment metadata                          |
| **API**       | `GET /api/v1/projects/:projectId/analytics`      | Aggregated analytics proxying to FastAPI                   |
| **Analytics** | `GET /health`                                    | Analytics liveness probe                                   |
| **Analytics** | `GET /ready`                                     | Analytics readiness probe checking database/Redis          |
| **Analytics** | `GET /docs`                                      | Interactive Swagger UI for Analytics API                   |
| **Analytics** | `GET /redoc`                                     | ReDoc API documentation for Analytics API                  |
| **Analytics** | `POST /api/v1/analytics/projects`                | Compute workload, cycle-time, and velocity metrics         |

A complete, exportable Postman collection is available at [`docs/WorkSphere_API.postman_collection.json`](file:///c:/Users/HANMANTHU/OneDrive/Documents/WorkSphere/docs/WorkSphere_API.postman_collection.json).

---

## Verification & Test Results

The WorkSphere test suite provides comprehensive verification across frontend, backend, analytics, and operational safety guards:

### Test Execution Summary

```
================================================================================
Test Suite Execution Results
================================================================================
Node.js & TypeScript Test Suites (Vitest):
  apps/api:    114 passed  (12 test files: controllers, services, repositories, SSE, worker, restore guards)
  apps/web:     36 passed  (7 test files: component rendering, role layouts, React Query hooks, SSE subscriber)
  Total JS/TS: 150 passed  (19 test files, 0 failed)

Python Test Suite (Pytest):
  apps/analytics: 5 passed (3 test files: streaming CSV, metrics calculation, auth, readiness)

Total Automated Tests: 155 passed (0 failed)

Code Quality & Type Verification:
  npm run format:check   --> PASS (Prettier formatting verified)
  npm run lint           --> PASS (ESLint 0 errors, 0 warnings across all workspaces)
  npm run typecheck      --> PASS (TypeScript compilation clean across all workspaces)
================================================================================
```

### Running Targeted Checks Locally

```bash
# Code formatting check
npm run format:check

# ESLint verification
npm run lint

# TypeScript compilation
npm run typecheck

# Full Vitest automated test suite (150 tests)
npm test

# Python analytics test suite (5 tests)
pytest apps/analytics/tests
```

---

## Continuous Integration (GitHub Actions)

All 6 GitHub Actions checks are verified and passing on `main` at commit [`295c0a5`](https://github.com/Naik1437/WorkSphere/commit/295c0a5) in the original repository [https://github.com/Naik1437/WorkSphere](https://github.com/Naik1437/WorkSphere):

1. **Quality & Validation**: Linting, formatting, and TypeScript checking (`npm run format:check`, `npm run lint`, `npm run typecheck`).
2. **Automated Test Matrix**: 150 Vitest tests (API + Web) and 5 Pytest analytics tests passing in CI clean runner.
3. **Docker Compose Validation**: Multi-container Compose configuration validated in CI with non-production placeholder safeguards.
4. **Next.js Production Build**: Standalone web application compilation verified (`npm run build -w @worksphere/web`).
5. **GHCR Container Publishing**: Multi-platform container images built with sanitized repository owner names.
6. **Staging Workflow Deployment Guard**: Staging pre-flight workflow verified with Compose and rollback validation; live deployment was skipped because staging target deployment configuration (`STAGING_DATABASE_URL`) was unavailable in repository secrets.

---

## Documentation Directory

- [Architecture Design](docs/architecture.md): Service boundaries, data flows, and concurrency models.
- [API Documentation](docs/API.md): Detailed API contract specifications and error codes.
- [Assessment Tracker](docs/assessment-tracker.md): Assessment-by-assessment requirement status matrix.
- [Assessment Progress](docs/ASSESSMENT_PROGRESS.md): Verified implementation evidence and audit details.
- [Operations & Incident Drills](docs/INCIDENT_DRILLS.md): Runbooks for database restore drills and disaster recovery.
- [Billing Architecture](docs/BILLING_ARCHITECTURE.md): Multi-tenant subscription and quota architecture specification.
