# WorkSphere REST API Documentation

Comprehensive reference for the WorkSphere multi-tenant project management and collaboration REST API.

---

## 1. Overview & Interactive Documentation

WorkSphere provides both an OpenAPI 3.0.3 specification and an interactive Swagger UI documentation dashboard.

- **Interactive Swagger UI**: [`/docs`](http://localhost:4000/docs) and [`/api/v1/docs`](http://localhost:4000/api/v1/docs)
- **Raw OpenAPI 3.0 Specification**: [`/api/v1/openapi.json`](http://localhost:4000/api/v1/openapi.json)
- **Postman Collection v2.1**: [`docs/WorkSphere_API.postman_collection.json`](file:///c:/Users/HANMANTHU/OneDrive/Documents/WorkSphere/docs/WorkSphere_API.postman_collection.json)
- **Base API URL**: `/api/v1`
- **Payload Format**: JSON (`application/json`), body size capped at 100 KB.
- **Request Tracing**: All responses include an `x-request-id` header for distributed tracing.

---

## 2. Authentication & Authorization

WorkSphere enforces tenant isolation across all resources using cryptographic HMAC access tokens.

### Access & Refresh Tokens

- **Access Token**: Short-lived (15 minutes), includes `userId`, `organizationId`, and `role`. Send via standard authorization header:
  ```http
  Authorization: Bearer <access_token>
  ```
- **Refresh Token**: Opaque rotating cryptographic token (14-day validity), stored hashed in PostgreSQL. Rotated upon `/api/v1/auth/refresh`.

### Roles & RBAC Matrix

| Role        | Permissions                                                                                         |
| :---------- | :-------------------------------------------------------------------------------------------------- |
| **OWNER**   | Full administrative rights: delete projects, manage teams, invite members, edit/delete tasks.       |
| **MANAGER** | Manage projects (create/edit), manage teams and team members, create milestones, edit/delete tasks. |
| **MEMBER**  | Create and update assigned tasks, subtasks, post comments, upload attachments.                      |
| **AUDITOR** | Read-only inspection of organization projects, tasks, comments, and activity audit logs.            |

---

## 3. Standard Response Envelopes

### Success Envelope

```json
{
  "data": { ... }
}
```

### Error Envelope

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Validation error description",
    "details": {
      "fieldErrors": {
        "title": ["Required"]
      }
    }
  }
}
```

### Common Error Codes

| HTTP Status | Code                    | Description                                      |
| :---------- | :---------------------- | :----------------------------------------------- |
| `400`       | `INVALID_INPUT`         | Zod schema validation failed.                    |
| `401`       | `UNAUTHORIZED`          | Missing, malformed, or expired access token.     |
| `403`       | `FORBIDDEN`             | Insufficient role permissions.                   |
| `404`       | `NOT_FOUND`             | Resource not found or belongs to another tenant. |
| `409`       | `VERSION_CONFLICT`      | Task optimistic concurrency version mismatch.    |
| `409`       | `REGISTRATION_CONFLICT` | Duplicate email or organization slug.            |

---

## 4. Endpoints Reference

### System & Health Probes

| Method | Path                   | Summary                               | Auth |
| :----- | :--------------------- | :------------------------------------ | :--- |
| `GET`  | `/health`              | Liveness health check                 | None |
| `GET`  | `/ready`               | Database & Redis readiness check      | None |
| `GET`  | `/docs`                | Interactive Swagger UI documentation  | None |
| `GET`  | `/api/v1/openapi.json` | Full OpenAPI 3.0.3 specification JSON | None |

### Authentication

| Method | Path                    | Summary                                       | Auth |
| :----- | :---------------------- | :-------------------------------------------- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user & organization owner        | None |
| `POST` | `/api/v1/auth/login`    | Authenticate with email and password          | None |
| `POST` | `/api/v1/auth/refresh`  | Rotate refresh token and get new access token | None |
| `POST` | `/api/v1/auth/logout`   | Revoke active refresh token session           | None |

### Organizations & Memberships

| Method | Path                                        | Summary                           | Auth                    |
| :----- | :------------------------------------------ | :-------------------------------- | :---------------------- |
| `GET`  | `/api/v1/organizations/current`             | Get current tenant profile        | Bearer                  |
| `GET`  | `/api/v1/organizations/current/members`     | List organization members         | Bearer                  |
| `POST` | `/api/v1/organizations/current/invitations` | Invite new member to organization | Bearer (OWNER, MANAGER) |
| `POST` | `/api/v1/invitations/accept`                | Accept membership invitation      | None                    |

### Teams & Members

| Method   | Path                                    | Summary                          | Auth                    |
| :------- | :-------------------------------------- | :------------------------------- | :---------------------- |
| `GET`    | `/api/v1/teams`                         | List organization teams          | Bearer                  |
| `POST`   | `/api/v1/teams`                         | Create new team                  | Bearer (OWNER, MANAGER) |
| `GET`    | `/api/v1/teams/:teamId`                 | Get team details and member list | Bearer                  |
| `DELETE` | `/api/v1/teams/:teamId`                 | Delete a team                    | Bearer (OWNER, MANAGER) |
| `POST`   | `/api/v1/teams/:teamId/members`         | Add user to team                 | Bearer (OWNER, MANAGER) |
| `DELETE` | `/api/v1/teams/:teamId/members/:userId` | Remove user from team            | Bearer (OWNER, MANAGER) |

### Projects & Milestones

| Method   | Path                                            | Summary                                                     | Auth                    |
| :------- | :---------------------------------------------- | :---------------------------------------------------------- | :---------------------- |
| `GET`    | `/api/v1/projects`                              | List projects (query: `limit`)                              | Bearer                  |
| `POST`   | `/api/v1/projects`                              | Create a new project                                        | Bearer (OWNER, MANAGER) |
| `GET`    | `/api/v1/projects/:projectId`                   | Get project details                                         | Bearer                  |
| `PATCH`  | `/api/v1/projects/:projectId`                   | Update project name or description                          | Bearer (OWNER, MANAGER) |
| `DELETE` | `/api/v1/projects/:projectId`                   | Delete project                                              | Bearer (OWNER)          |
| `GET`    | `/api/v1/projects/:projectId/analytics`         | Task status counts & completion analytics                   | Bearer                  |
| `GET`    | `/api/v1/projects/:projectId/milestones`        | List project milestones                                     | Bearer                  |
| `POST`   | `/api/v1/projects/:projectId/milestones`        | Create milestone                                            | Bearer (OWNER, MANAGER) |
| `GET`    | `/api/v1/projects/:projectId/calendar.ics`      | Export RFC 5545 iCalendar (.ics) with milestones and tasks  | Bearer                  |
| `POST`   | `/api/v1/projects/:projectId/webhooks/dispatch` | Schedule HMAC-signed webhook delivery via persistent outbox | Bearer (OWNER, MANAGER) |

### Tasks & Subtasks

| Method   | Path                                | Summary                             | Auth                    |
| :------- | :---------------------------------- | :---------------------------------- | :---------------------- |
| `GET`    | `/api/v1/projects/:projectId/tasks` | List tasks (query: `limit`)         | Bearer                  |
| `POST`   | `/api/v1/projects/:projectId/tasks` | Create task (optional `parentId`)   | Bearer (non-AUDITOR)    |
| `PATCH`  | `/api/v1/tasks/:taskId`             | Update task with required `version` | Bearer                  |
| `DELETE` | `/api/v1/tasks/:taskId`             | Delete task                         | Bearer (OWNER, MANAGER) |
| `GET`    | `/api/v1/tasks/:taskId/subtasks`    | List child subtasks                 | Bearer                  |
| `POST`   | `/api/v1/tasks/:taskId/subtasks`    | Create subtask under parent task    | Bearer (non-AUDITOR)    |

### Collaboration & Notifications

| Method | Path                                | Summary                                 | Auth   |
| :----- | :---------------------------------- | :-------------------------------------- | :----- |
| `POST` | `/api/v1/tasks/:taskId/comments`    | Post comment and write audit entry      | Bearer |
| `GET`  | `/api/v1/tasks/:taskId/activity`    | List chronological activity events      | Bearer |
| `POST` | `/api/v1/tasks/:taskId/attachments` | Register file attachment metadata       | Bearer |
| `POST` | `/api/v1/tasks/:taskId/reminders`   | Schedule reminder via persistent outbox | Bearer |

---

## 5. Realistic Request & Response Examples

### Register User & Organization

**`POST /api/v1/auth/register`**

```json
// Request
{
  "email": "alice@acme.corp",
  "password": "SuperSecurePassword123!",
  "organizationName": "Acme Global Operations",
  "organizationSlug": "acme-global"
}

// Response (201 Created)
{
  "data": {
    "organization": {
      "id": "87e246cf-3069-42b4-82a1-fa4f91e6b567",
      "name": "Acme Global Operations",
      "slug": "acme-global"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "b3f5c1d2e4a6890f1234567890abcdef1234567890abcdef1234567890abcdef"
  }
}
```

### Create Team

**`POST /api/v1/teams`**

```json
// Request
{
  "name": "Frontend Platform Team",
  "description": "Engineers responsible for Next.js web application and design system"
}

// Response (201 Created)
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "organizationId": "87e246cf-3069-42b4-82a1-fa4f91e6b567",
    "name": "Frontend Platform Team",
    "description": "Engineers responsible for Next.js web application and design system",
    "createdAt": "2026-11-23T08:15:00.000Z",
    "updatedAt": "2026-11-23T08:15:00.000Z"
  }
}
```

### Add Team Member

**`POST /api/v1/teams/550e8400-e29b-41d4-a716-446655440000/members`**

```json
// Request
{
  "userId": "c4b82d41-3b7d-472e-84cf-26f5f9bf723c"
}

// Response (201 Created)
{
  "data": {
    "id": "d1c3a649-0fa4-4f81-a957-c8389655f462",
    "teamId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "c4b82d41-3b7d-472e-84cf-26f5f9bf723c",
    "joinedAt": "2026-11-23T08:16:00.000Z"
  }
}
```

### Create Project Task

**`POST /api/v1/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6/tasks`**

```json
// Request
{
  "title": "Implement Teams & Subtasks REST Endpoints",
  "description": "Add endpoints for team creation and task hierarchy",
  "status": "TODO"
}

// Response (201 Created)
{
  "data": {
    "id": "9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991",
    "projectId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "organizationId": "87e246cf-3069-42b4-82a1-fa4f91e6b567",
    "parentId": null,
    "title": "Implement Teams & Subtasks REST Endpoints",
    "description": "Add endpoints for team creation and task hierarchy",
    "status": "TODO",
    "version": 1,
    "createdAt": "2026-11-23T08:35:00.000Z",
    "updatedAt": "2026-11-23T08:35:00.000Z"
  }
}
```

### Create Subtask Under Task

**`POST /api/v1/tasks/9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991/subtasks`**

```json
// Request
{
  "title": "Draft OpenAPI spec module",
  "description": "Define models and endpoints",
  "status": "TODO"
}

// Response (201 Created)
{
  "data": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "projectId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "organizationId": "87e246cf-3069-42b4-82a1-fa4f91e6b567",
    "parentId": "9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991",
    "title": "Draft OpenAPI spec module",
    "description": "Define models and endpoints",
    "status": "TODO",
    "version": 1,
    "createdAt": "2026-11-23T08:50:00.000Z",
    "updatedAt": "2026-11-23T08:50:00.000Z"
  }
}
```

### Task Optimistic Concurrency Update

**`PATCH /api/v1/tasks/9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991`**

```json
// Request: Must provide known current version (e.g. 1)
{
  "version": 1,
  "status": "DONE",
  "description": "Implementation verified against test suite"
}

// Response (200 OK): Version increments automatically to 2
{
  "data": {
    "id": "9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991",
    "projectId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "organizationId": "87e246cf-3069-42b4-82a1-fa4f91e6b567",
    "parentId": null,
    "title": "Implement Teams & Subtasks REST Endpoints",
    "description": "Implementation verified against test suite",
    "status": "DONE",
    "version": 2,
    "createdAt": "2026-11-23T08:35:00.000Z",
    "updatedAt": "2026-11-23T09:40:00.000Z"
  }
}

// Conflict Response (409 Conflict): If another client already updated the task
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Current version mismatch"
  }
}
```

### Schedule Task Reminder (Persistent Outbox)

**`POST /api/v1/tasks/9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991/reminders`**

```json
// Request
{
  "idempotencyKey": "reminder-task-9a22-step-review",
  "deliverAt": "2026-11-24T09:00:00.000Z"
}

// Response (202 Accepted)
{
  "data": {
    "id": "e0123456-789a-bcde-f012-3456789abcde",
    "type": "TASK_REMINDER",
    "status": "PENDING",
    "runAt": "2026-11-24T09:00:00.000Z"
  },
  "meta": {
    "worker": "persistent-outbox-active"
  }
}
```
