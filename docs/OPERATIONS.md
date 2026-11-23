# Deployment and incident guide

## Deployment

Use a unique `POSTGRES_PASSWORD` and `AUTH_SECRET` in each environment; never commit them. Keep PostgreSQL and Redis private to the Compose network. Place the web/API services behind an HTTPS reverse proxy that terminates TLS, limits request size/rate, and forwards request IDs. Deploy migrations with `npm run migrate:deploy -w @worksphere/database` as a controlled release step, then check `/ready` on API and Analytics.

Back up PostgreSQL before each migration and test a restore into an isolated database regularly. Monitor container health, API 5xx rates, job failures, and database connection latency.

## Incident drills

| Scenario              | Detect                            | Contain and recover                                                                  | Evidence to retain                       |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| Database latency      | `/ready` failures, slow API logs  | stop writes if saturation persists; inspect connections/query plan; restore capacity | timestamps, query plan, readiness output |
| Redis outage          | API readiness and worker failures | pause workers; do not acknowledge jobs; resume after health returns                  | job IDs and retry count                  |
| Duplicate job         | duplicate event key               | rely on unique idempotency key; inspect notification/job row                         | event key and row state                  |
| Email failure         | failed notification/job           | retry with bounded backoff then dead-letter; use console adapter only locally        | provider result and attempt count        |
| Stale task update     | `409 VERSION_CONFLICT`            | reload task/activity and submit user-reviewed change                                 | task ID, versions, activity entries      |
| Tenant access attempt | 403/404 audit logs                | verify token organization and resource query scope; rotate credentials if needed     | request ID, actor/org IDs, resolution    |

## Root cause template

Record impact, detection time, timeline, affected tenant IDs, direct cause, contributing controls, recovery steps, data validation, owner, and a regression test or monitoring action.
