# WorkSphere

Phase 1 foundation for a multi-tenant project management and workflow automation platform. It provides service boundaries, local infrastructure, health/readiness checks, an initial tenant schema migration, a responsive Next.js shell, tests, and development conventions. Product workflows are intentionally out of scope until later phases.

## Prerequisites

- Node.js 22+ and npm 10+
- Python 3.13+
- Docker Desktop with Compose v2

## Local setup

1. Copy `.env.example` to `.env` and set a unique local `POSTGRES_PASSWORD`. Keep `.env` uncommitted.
2. Install JavaScript dependencies: `npm install`.
3. Create a Python virtual environment and install analytics dependencies: `python -m venv .venv`, then activate it and run `pip install -r apps/analytics/requirements.txt`.
4. Start the full local stack: `docker compose up --build`.
5. Apply the initial schema migration after the database is healthy: `docker compose exec api npm run migrate:deploy -w @worksphere/database`.

After pulling workflow additions, apply every committed migration with the same command. Set a unique `AUTH_SECRET` (at least 32 characters) and `ANALYTICS_SERVICE_TOKEN` in the local `.env` before using local credential sessions or protecting analytics requests.

The Compose database and Redis are intentionally private to the Docker network. The browser-facing services are available at `http://localhost:3000`, `http://localhost:4000/health`, and `http://localhost:8000/health`.

The default Compose setup does not publish database or Redis ports. This is intentional; use the containerized services for local integration verification. If you need host-based development, create a local uncommitted Compose override with explicit development-only ports.

## Verification

Run JavaScript quality checks with `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Run analytics tests with `pytest apps/analytics/tests`. When Compose is running, `/ready` on both backend services verifies PostgreSQL and Redis connectivity.

## Repository layout

- `apps/web`: Next.js App Router interface.
- `apps/api`: Express primary API.
- `apps/analytics`: independently deployable FastAPI service.
- `packages/database`: Prisma schema and committed SQL migrations.
- `docs`: architecture, phased plan, and assessment status.

See [architecture](docs/architecture.md), [implementation plan](docs/implementation-plan.md), and the [assessment tracker](docs/assessment-tracker.md).

API usage and deployment/incident guidance are in [API documentation](docs/API.md) and [operations](docs/OPERATIONS.md). The live assessment coverage estimate is tracked in [assessment progress](docs/ASSESSMENT_PROGRESS.md).
