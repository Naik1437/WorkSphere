# WorkSphere API v1

Base URL: `/api/v1`. JSON requests are limited to 100 KB. Responses use `{ "data": ... }` on success and `{ "error": { "code": "..." } }` on failure.

## Authentication

`POST /auth/register` creates a local user and owner organization. Supply `email`, a password of at least 12 characters, `organizationName`, and a lowercase `organizationSlug`. `POST /auth/login` supplies `email` and `password`. Both return a 15-minute access token and a rotating refresh token. Send `Authorization: Bearer <access token>` to protected routes. `POST /auth/refresh` rotates a refresh token; `POST /auth/logout` revokes it.

Access tokens are scoped to one organization and role. Owner/manager roles create projects, milestones, and invitations. Auditors cannot create tasks. All project/task lookups include organization scoping.

## Resources

| Method       | Path                                                                   | Purpose                                                                                                            |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET/POST     | `/projects`                                                            | List or create projects for the active organization.                                                               |
| GET/POST     | `/projects/:projectId/tasks`                                           | List or create project tasks.                                                                                      |
| PATCH/DELETE | `/tasks/:taskId`                                                       | Update with required current `version`, or delete (owner/manager). A stale version returns `409 VERSION_CONFLICT`. |
| POST         | `/projects/:projectId/milestones`                                      | Create a milestone.                                                                                                |
| POST         | `/tasks/:taskId/comments`                                              | Add a comment and task activity.                                                                                   |
| GET          | `/tasks/:taskId/activity`                                              | List recent task activity.                                                                                         |
| GET/POST     | `/organizations/current/members`, `/organizations/current/invitations` | List members or issue local invitation tokens.                                                                     |
| POST         | `/invitations/accept`                                                  | Accept a valid invitation for an existing account.                                                                 |

Collections currently cap results at 100. Pagination cursor/filter parameters are planned; callers must not infer complete historical data from a single response.

## Integration contract

The local `ConsoleEmailAdapter` is a demo adapter. Webhook helpers use HMAC SHA-256 and persistent `(provider, externalId)` uniqueness for duplicate prevention. Production adapters must enforce provider timeouts, verify signatures using the original raw body, and persist idempotency outcomes before side effects.

## Operational behavior

`/health` confirms process liveness. `/ready` verifies PostgreSQL and Redis. Rate limiting is expected at a reverse proxy or gateway; deployers should enforce per-user and per-IP limits there.
