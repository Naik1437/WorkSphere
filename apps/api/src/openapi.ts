/**
 * OpenAPI 3.0.3 specification and Swagger UI renderer for WorkSphere API.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'WorkSphere REST API',
    version: '1.0.0',
    description:
      'WorkSphere enterprise project-management and team collaboration API. Supports multi-tenant isolation, role-based access control (OWNER, MANAGER, MEMBER, AUDITOR), optimistic concurrency control for tasks, teams and subtasks, background job outbox, and audit activity logging.',
    contact: {
      name: 'WorkSphere Engineering Team',
      url: 'https://worksphere.local',
    },
    license: {
      name: 'Proprietary / Enterprise',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Current WorkSphere host',
    },
  ],
  tags: [
    { name: 'System', description: 'Health and readiness probes' },
    { name: 'Authentication', description: 'Session issuance, refresh, and revocation' },
    { name: 'Organizations', description: 'Tenant management, memberships, and invitations' },
    { name: 'Teams', description: 'Team workspace and member management' },
    { name: 'Projects', description: 'Project workspaces and milestone tracking' },
    { name: 'Tasks', description: 'Task lifecycle, concurrency control, and subtasks' },
    { name: 'Collaboration', description: 'Comments, activity audit logs, and file attachments' },
    { name: 'Notifications', description: 'Outbox job scheduling and reminders' },
    { name: 'Real-Time & Updates', description: 'Server-Sent Events (SSE) stream for live collaborative updates' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'HMAC-SHA256 Token',
        description: 'Provide your 15-minute access token in the Authorization header: `Bearer <token>`',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Authentication token missing, invalid, or expired',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' },
            },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions or role for this resource',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: { code: 'FORBIDDEN', message: 'User role lacks sufficient permissions' },
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found or does not belong to active organization',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: { code: 'NOT_FOUND', message: 'Requested resource not found' },
            },
          },
        },
      },
      Conflict: {
        description: 'Optimistic concurrency version conflict or duplicate record',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: { code: 'VERSION_CONFLICT', message: 'Current version mismatch' },
            },
          },
        },
      },
      BadRequest: {
        description: 'Input validation failure or malformed payload',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: { code: 'INVALID_INPUT', details: { fieldErrors: { title: ['Required'] } } },
            },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code'],
            properties: {
              code: { type: 'string', example: 'INVALID_INPUT' },
              message: { type: 'string', example: 'Validation error description' },
              details: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
          email: { type: 'string', format: 'email', example: 'alice@acme.corp' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:00:00.000Z' },
        },
      },
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '87e246cf-3069-42b4-82a1-fa4f91e6b567' },
          name: { type: 'string', example: 'Acme Global Operations' },
          slug: { type: 'string', example: 'acme-global' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:00:00.000Z' },
        },
      },
      Membership: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'e7cb2811-3fb3-488b-a488-dcff7ecbe9fa' },
          userId: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
          organizationId: { type: 'string', format: 'uuid', example: '87e246cf-3069-42b4-82a1-fa4f91e6b567' },
          role: { type: 'string', enum: ['OWNER', 'MANAGER', 'MEMBER', 'AUDITOR'], example: 'OWNER' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Team: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
          organizationId: { type: 'string', format: 'uuid', example: '87e246cf-3069-42b4-82a1-fa4f91e6b567' },
          name: { type: 'string', example: 'Frontend Platform Team' },
          description: { type: 'string', example: 'Engineers responsible for Next.js web application and design system' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:15:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:15:00.000Z' },
          members: {
            type: 'array',
            items: { $ref: '#/components/schemas/TeamMember' },
          },
        },
      },
      TeamMember: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'd1c3a649-0fa4-4f81-a957-c8389655f462' },
          teamId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
          userId: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
          joinedAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:16:00.000Z' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          organizationId: { type: 'string', format: 'uuid', example: '87e246cf-3069-42b4-82a1-fa4f91e6b567' },
          name: { type: 'string', example: 'Core Platform Migration' },
          description: { type: 'string', example: 'Migrating legacy services to modern containerized microservices' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:30:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:30:00.000Z' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
          projectId: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          organizationId: { type: 'string', format: 'uuid', example: '87e246cf-3069-42b4-82a1-fa4f91e6b567' },
          parentId: { type: 'string', format: 'uuid', nullable: true, example: null },
          title: { type: 'string', example: 'Implement Teams & Subtasks REST Endpoints' },
          description: { type: 'string', example: 'Add endpoints for team creation and task hierarchy' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'], example: 'IN_PROGRESS' },
          version: { type: 'integer', example: 1, description: 'Optimistic concurrency version counter' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:35:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:40:00.000Z' },
          subtasks: {
            type: 'array',
            items: { $ref: '#/components/schemas/Task' },
          },
        },
      },
      Milestone: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '4c84a8b0-4e55-46c6-a67b-1175c2e105a2' },
          projectId: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          name: { type: 'string', example: 'Phase 1 Public Beta Launch' },
          dueAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-12-15T00:00:00.000Z' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T08:45:00.000Z' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'f1e2d3c4-b5a6-4789-9012-3456789abcde' },
          taskId: { type: 'string', format: 'uuid', example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
          authorId: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
          body: { type: 'string', example: 'API tests passing; ready for code review.' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T09:00:00.000Z' },
        },
      },
      ActivityLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'aa11bb22-cc33-44dd-ee55-ff66aa77bb88' },
          taskId: { type: 'string', format: 'uuid', example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
          actorId: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
          action: { type: 'string', example: 'COMMENT_CREATED' },
          metadata: { type: 'object', additionalProperties: true, example: { commentId: 'f1e2d3c4-b5a6-4789-9012-3456789abcde' } },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T09:00:00.000Z' },
        },
      },
      Attachment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '98765432-abcd-ef01-2345-6789abcdef01' },
          taskId: { type: 'string', format: 'uuid', example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
          filename: { type: 'string', example: 'architecture_diagram.png' },
          contentType: { type: 'string', example: 'image/png' },
          sizeBytes: { type: 'integer', example: 1048576 },
          createdAt: { type: 'string', format: 'date-time', example: '2026-11-23T09:10:00.000Z' },
        },
      },
      ReminderJob: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'e0123456-789a-bcde-f012-3456789abcde' },
          type: { type: 'string', example: 'TASK_REMINDER' },
          payload: {
            type: 'object',
            properties: {
              taskId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              organizationId: { type: 'string', format: 'uuid' },
              deliverAt: { type: 'string', format: 'date-time' },
            },
          },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], example: 'PENDING' },
          runAt: { type: 'string', format: 'date-time', example: '2026-11-23T12:00:00.000Z' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness health check',
        description: 'Returns HTTP 200 when the Express API process is live and responsive.',
        responses: {
          '200': {
            description: 'API process healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'api' },
                  },
                },
                example: { status: 'ok', service: 'api' },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['System'],
        summary: 'Readiness probe',
        description: 'Verifies live connectivity to PostgreSQL database and Redis cluster.',
        responses: {
          '200': {
            description: 'All backing dependencies are ready',
            content: {
              'application/json': {
                example: {
                  status: 'ready',
                  checks: { database: 'ok', redis: 'ok' },
                },
              },
            },
          },
          '503': {
            description: 'One or more backing services unavailable',
            content: {
              'application/json': {
                example: {
                  status: 'unavailable',
                  checks: { database: 'unavailable', redis: 'ok' },
                },
              },
            },
          },
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['System'],
        summary: 'Application metrics & telemetry (Prometheus & JSON)',
        description: 'Exposes telemetry tracking API request counts, latencies (p50/p90/p99), error rates, database/redis connectivity, queue lag, and system memory. Supports both Prometheus text format (default) and structured JSON (?format=json). Excludes all sensitive tenant data and PII.',
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['prometheus', 'json'], default: 'prometheus' },
            description: 'Response payload format (or specify Accept: application/json header)',
          },
        ],
        responses: {
          '200': {
            description: 'Application telemetry snapshot',
            content: {
              'text/plain': {
                schema: { type: 'string' },
                example: '# HELP worksphere_http_requests_total Total number of HTTP requests\nworksphere_http_requests_total 42\n',
              },
              'application/json': {
                example: {
                  status: 'healthy',
                  timestamp: '2026-11-23T14:00:00.000Z',
                  uptimeSeconds: 120.5,
                  http: {
                    totalRequests: 42,
                    inFlightRequests: 1,
                    totalErrors: 0,
                    errorRatePercentage: 0,
                    statusClasses: { '2xx': 42, '3xx': 0, '4xx': 0, '5xx': 0 },
                    latencyMs: { average: 12.5, min: 2.1, max: 45.0, p50: 10.0, p90: 25.0, p99: 40.0 },
                  },
                  dependencies: {
                    database: { status: 'up', latencyMs: 2.3 },
                    redis: { status: 'up', latencyMs: 1.1 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register new user and tenant organization',
        description: 'Creates a new user account, creates the root tenant organization, assigns the user the OWNER role, and issues a 15-minute access token and rotating refresh token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'organizationName', 'organizationSlug'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'alice@acme.corp' },
                  password: { type: 'string', minLength: 12, maxLength: 128, example: 'SuperSecurePassword123!' },
                  organizationName: { type: 'string', minLength: 2, maxLength: 160, example: 'Acme Global Operations' },
                  organizationSlug: { type: 'string', pattern: '^[a-z0-9-]{3,64}$', example: 'acme-global' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User and organization successfully created',
            content: {
              'application/json': {
                example: {
                  data: {
                    organization: {
                      id: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      name: 'Acme Global Operations',
                      slug: 'acme-global',
                    },
                    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
                    refreshToken: 'b3f5c1d2e4a6890f1234567890abcdef1234567890abcdef1234567890abcdef',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': {
            description: 'Email or organization slug already registered',
            content: {
              'application/json': {
                example: { error: { code: 'REGISTRATION_CONFLICT', message: 'User or organization already exists' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with credentials',
        description: 'Validates user email and password against argon2/scrypt hash, issues a 15-minute access token and rotating refresh token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'alice@acme.corp' },
                  password: { type: 'string', example: 'SuperSecurePassword123!' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                example: {
                  data: {
                    organization: {
                      id: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      name: 'Acme Global Operations',
                      slug: 'acme-global',
                    },
                    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
                    refreshToken: 'b3f5c1d2e4a6890f1234567890abcdef1234567890abcdef1234567890abcdef',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': {
            description: 'Invalid email or password',
            content: {
              'application/json': {
                example: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate refresh token and get new access token',
        description: 'Exchanges an unexpired refresh token for a new access token and rotating refresh token. The previous refresh token is invalidated.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: 'b3f5c1d2e4a6890f1234567890abcdef1234567890abcdef1234567890abcdef' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tokens successfully rotated',
            content: {
              'application/json': {
                example: {
                  data: {
                    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newPayload.newSignature',
                    refreshToken: 'c4e6d2e5b7a8901f2345678901abcdef2345678901abcdef2345678901abcdef',
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke active refresh token',
        description: 'Deletes the specified refresh token session from PostgreSQL.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: 'b3f5c1d2e4a6890f1234567890abcdef1234567890abcdef1234567890abcdef' },
                },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Session revoked successfully' },
        },
      },
    },
    '/api/v1/organizations/current': {
      get: {
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        summary: 'Get active organization profile',
        description: 'Retrieves tenant organization details for the caller active authenticated organization context.',
        responses: {
          '200': {
            description: 'Current organization profile',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'Acme Global Operations',
                    slug: 'acme-global',
                    createdAt: '2026-11-23T08:00:00.000Z',
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/organizations/current/members': {
      get: {
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        summary: 'List organization members',
        description: 'Lists all users with active memberships in the current organization.',
        responses: {
          '200': {
            description: 'Organization members list',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: 'e7cb2811-3fb3-488b-a488-dcff7ecbe9fa',
                      userId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      role: 'OWNER',
                      user: { id: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c', email: 'alice@acme.corp' },
                    },
                    {
                      id: 'fa993102-1ac4-4672-9112-be224eac9012',
                      userId: 'd9e03f12-2c34-4567-8901-23456789abcd',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      role: 'MANAGER',
                      user: { id: 'd9e03f12-2c34-4567-8901-23456789abcd', email: 'bob@acme.corp' },
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/organizations/current/invitations': {
      post: {
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        summary: 'Invite new member to organization',
        description: 'Issues a cryptographic invitation token for an email address. Restricted to OWNER and MANAGER roles.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'carol@acme.corp' },
                  role: { type: 'string', enum: ['MANAGER', 'MEMBER', 'AUDITOR'], default: 'MEMBER', example: 'MEMBER' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invitation issued successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: 'b1234567-89ab-cdef-0123-456789abcdef',
                    email: 'carol@acme.corp',
                    role: 'MEMBER',
                    token: 'invitation-secret-token-sample',
                    expiresAt: '2026-11-30T08:00:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/invitations/accept': {
      post: {
        tags: ['Organizations'],
        summary: 'Accept an organization invitation',
        description: 'Consumes an unexpired invitation token, attaching the user to the organization with the specified role.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'email'],
                properties: {
                  token: { type: 'string', example: 'invitation-secret-token-sample' },
                  email: { type: 'string', format: 'email', example: 'carol@acme.corp' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Invitation accepted and membership created',
            content: {
              'application/json': {
                example: {
                  data: {
                    membership: {
                      id: '778899aa-bbcc-ddee-ff00-112233445566',
                      userId: '11223344-5566-7788-99aa-bbccddeeff00',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      role: 'MEMBER',
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': {
            description: 'Invitation token invalid, expired, or user not found',
            content: {
              'application/json': {
                example: { error: { code: 'INVALID_INVITATION', message: 'Invitation not found or expired' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/teams': {
      get: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'List organization teams',
        description: 'Returns all teams belonging to the active tenant organization, including team member counts and member profiles.',
        responses: {
          '200': {
            description: 'List of teams',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '550e8400-e29b-41d4-a716-446655440000',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      name: 'Frontend Platform Team',
                      description: 'Engineers responsible for Next.js web application and design system',
                      createdAt: '2026-11-23T08:15:00.000Z',
                      updatedAt: '2026-11-23T08:15:00.000Z',
                      members: [
                        {
                          id: 'd1c3a649-0fa4-4f81-a957-c8389655f462',
                          teamId: '550e8400-e29b-41d4-a716-446655440000',
                          userId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                          joinedAt: '2026-11-23T08:16:00.000Z',
                          user: { id: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c', email: 'alice@acme.corp' },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a new team',
        description: 'Creates a team within the active organization. Restricted to OWNER and MANAGER roles.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 160, example: 'DevOps & Infrastructure' },
                  description: { type: 'string', maxLength: 4000, example: 'Kubernetes, CI/CD pipelines, and observability' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Team created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '661f9511-f30c-52e5-b827-557766551111',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'DevOps & Infrastructure',
                    description: 'Kubernetes, CI/CD pipelines, and observability',
                    createdAt: '2026-11-23T09:20:00.000Z',
                    updatedAt: '2026-11-23T09:20:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/teams/{teamId}': {
      get: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'Get team details by ID',
        description: 'Retrieves a single team by ID scoped to the active organization, including enrolled team members.',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '550e8400-e29b-41d4-a716-446655440000' },
        ],
        responses: {
          '200': {
            description: 'Team details retrieved',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '550e8400-e29b-41d4-a716-446655440000',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'Frontend Platform Team',
                    description: 'Engineers responsible for Next.js web application and design system',
                    createdAt: '2026-11-23T08:15:00.000Z',
                    updatedAt: '2026-11-23T08:15:00.000Z',
                    members: [
                      {
                        id: 'd1c3a649-0fa4-4f81-a957-c8389655f462',
                        teamId: '550e8400-e29b-41d4-a716-446655440000',
                        userId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                        joinedAt: '2026-11-23T08:16:00.000Z',
                        user: { id: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c', email: 'alice@acme.corp' },
                      },
                    ],
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete a team',
        description: 'Removes a team and its member associations. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '550e8400-e29b-41d4-a716-446655440000' },
        ],
        responses: {
          '204': { description: 'Team successfully deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/teams/{teamId}/members': {
      post: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'Add a user to a team',
        description: 'Assigns an existing organization member to a team. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '550e8400-e29b-41d4-a716-446655440000' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId'],
                properties: {
                  userId: { type: 'string', format: 'uuid', example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Member added to team',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: 'd1c3a649-0fa4-4f81-a957-c8389655f462',
                    teamId: '550e8400-e29b-41d4-a716-446655440000',
                    userId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                    joinedAt: '2026-11-23T08:16:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/teams/{teamId}/members/{userId}': {
      delete: {
        tags: ['Teams'],
        security: [{ bearerAuth: [] }],
        summary: 'Remove a user from a team',
        description: 'Removes the team membership for the specified user. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '550e8400-e29b-41d4-a716-446655440000' },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c' },
        ],
        responses: {
          '204': { description: 'Member removed from team' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/projects': {
      get: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'List organization projects',
        description: 'Returns projects belonging to the active organization.',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50, maximum: 100 }, example: 20 },
        ],
        responses: {
          '200': {
            description: 'List of projects',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      name: 'Core Platform Migration',
                      description: 'Migrating legacy services to modern containerized microservices',
                      createdAt: '2026-11-23T08:30:00.000Z',
                      updatedAt: '2026-11-23T08:30:00.000Z',
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a project',
        description: 'Creates a project in the caller active organization. Restricted to OWNER and MANAGER roles.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 160, example: 'Core Platform Migration' },
                  description: { type: 'string', maxLength: 4000, example: 'Migrating legacy services to modern containerized microservices' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Project created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'Core Platform Migration',
                    description: 'Migrating legacy services to modern containerized microservices',
                    createdAt: '2026-11-23T08:30:00.000Z',
                    updatedAt: '2026-11-23T08:30:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/projects/{projectId}': {
      get: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Get project details',
        description: 'Retrieves a project by ID, verifying tenant isolation.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        responses: {
          '200': {
            description: 'Project details retrieved',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'Core Platform Migration',
                    description: 'Migrating legacy services to modern containerized microservices',
                    createdAt: '2026-11-23T08:30:00.000Z',
                    updatedAt: '2026-11-23T08:30:00.000Z',
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Update project properties',
        description: 'Updates project name or description. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 160, example: 'Core Platform Migration (Q4)' },
                  description: { type: 'string', maxLength: 4000, example: 'Updated scope for fourth quarter deliverables' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Project updated successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    name: 'Core Platform Migration (Q4)',
                    description: 'Updated scope for fourth quarter deliverables',
                    createdAt: '2026-11-23T08:30:00.000Z',
                    updatedAt: '2026-11-23T09:30:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete project',
        description: 'Permanently removes a project and its associated resources. Restricted to OWNER role.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        responses: {
          '204': { description: 'Project deleted successfully' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/projects/{projectId}/analytics': {
      get: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Get project task distribution analytics',
        description: 'Aggregates task status counts and computes progress percentage. Proxies to Python FastAPI analytics microservice if available.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        responses: {
          '200': {
            description: 'Analytics summary metrics',
            content: {
              'application/json': {
                example: {
                  data: {
                    projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    totalTasks: 24,
                    byStatus: { TODO: 6, IN_PROGRESS: 10, BLOCKED: 2, DONE: 6 },
                    completionRate: 0.25,
                    source: 'analytics-service',
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/projects/{projectId}/milestones': {
      get: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'List project milestones',
        description: 'Lists all milestones defined for the given project.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        responses: {
          '200': {
            description: 'List of milestones',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '4c84a8b0-4e55-46c6-a67b-1175c2e105a2',
                      projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                      name: 'Phase 1 Public Beta Launch',
                      dueAt: '2026-12-15T00:00:00.000Z',
                      createdAt: '2026-11-23T08:45:00.000Z',
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        summary: 'Create project milestone',
        description: 'Creates a milestone within a project. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 160, example: 'Phase 1 Public Beta Launch' },
                  dueAt: { type: 'string', format: 'date-time', example: '2026-12-15T00:00:00.000Z' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Milestone created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '4c84a8b0-4e55-46c6-a67b-1175c2e105a2',
                    projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    name: 'Phase 1 Public Beta Launch',
                    dueAt: '2026-12-15T00:00:00.000Z',
                    createdAt: '2026-11-23T08:45:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/projects/{projectId}/tasks': {
      get: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'List project tasks',
        description: 'Returns tasks belonging to the specified project. Includes subtasks array.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50, maximum: 100 }, example: 50 },
        ],
        responses: {
          '200': {
            description: 'List of tasks',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                      projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      parentId: null,
                      title: 'Implement Teams & Subtasks REST Endpoints',
                      description: 'Add endpoints for team creation and task hierarchy',
                      status: 'IN_PROGRESS',
                      version: 1,
                      createdAt: '2026-11-23T08:35:00.000Z',
                      updatedAt: '2026-11-23T08:40:00.000Z',
                      subtasks: [],
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a task in project',
        description: 'Creates a task within the project. Supports optional parentId for subtask creation. Restricted to non-AUDITOR roles.',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 200, example: 'Implement Teams & Subtasks REST Endpoints' },
                  description: { type: 'string', maxLength: 4000, example: 'Add endpoints for team creation and task hierarchy' },
                  status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'], default: 'TODO', example: 'TODO' },
                  parentId: { type: 'string', format: 'uuid', nullable: true, example: null },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Task created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                    projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    parentId: null,
                    title: 'Implement Teams & Subtasks REST Endpoints',
                    description: 'Add endpoints for team creation and task hierarchy',
                    status: 'TODO',
                    version: 1,
                    createdAt: '2026-11-23T08:35:00.000Z',
                    updatedAt: '2026-11-23T08:35:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}': {
      patch: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'Update task with optimistic concurrency',
        description: 'Updates task title, description, or status. Requires current `version` integer in the body. If the version does not match the database version, returns HTTP 409 VERSION_CONFLICT.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['version'],
                properties: {
                  version: { type: 'integer', minimum: 1, example: 1, description: 'Current known version of the task' },
                  title: { type: 'string', minLength: 1, maxLength: 200, example: 'Implement Teams & Subtasks REST Endpoints (Refined)' },
                  description: { type: 'string', maxLength: 4000, example: 'Complete unit test coverage for hierarchy' },
                  status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'], example: 'DONE' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Task updated successfully; version incremented',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                    projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    parentId: null,
                    title: 'Implement Teams & Subtasks REST Endpoints (Refined)',
                    description: 'Complete unit test coverage for hierarchy',
                    status: 'DONE',
                    version: 2,
                    createdAt: '2026-11-23T08:35:00.000Z',
                    updatedAt: '2026-11-23T09:40:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'Delete task',
        description: 'Permanently deletes a task and associated comments, activity logs, and subtasks. Restricted to OWNER and MANAGER roles.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        responses: {
          '204': { description: 'Task deleted successfully' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}/subtasks': {
      get: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'List subtasks for a task',
        description: 'Retrieves all child tasks where parentId equals taskId.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        responses: {
          '200': {
            description: 'List of subtasks',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
                      projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                      organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                      parentId: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                      title: 'Draft OpenAPI spec module',
                      description: 'Define models and endpoints',
                      status: 'DONE',
                      version: 1,
                      createdAt: '2026-11-23T08:50:00.000Z',
                      updatedAt: '2026-11-23T08:55:00.000Z',
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Tasks'],
        security: [{ bearerAuth: [] }],
        summary: 'Create a subtask',
        description: 'Creates a child task under the specified parent taskId, automatically inheriting the parent projectId and organizationId.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 200, example: 'Draft OpenAPI spec module' },
                  description: { type: 'string', maxLength: 4000, example: 'Define models and endpoints' },
                  status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'], default: 'TODO', example: 'TODO' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Subtask created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
                    projectId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                    organizationId: '87e246cf-3069-42b4-82a1-fa4f91e6b567',
                    parentId: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                    title: 'Draft OpenAPI spec module',
                    description: 'Define models and endpoints',
                    status: 'TODO',
                    version: 1,
                    createdAt: '2026-11-23T08:50:00.000Z',
                    updatedAt: '2026-11-23T08:50:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}/comments': {
      post: {
        tags: ['Collaboration'],
        security: [{ bearerAuth: [] }],
        summary: 'Add a comment to task',
        description: 'Appends a comment to a task and automatically creates an audit activity log entry.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['body'],
                properties: {
                  body: { type: 'string', minLength: 1, maxLength: 5000, example: 'Verified endpoint behavior in local test suite.' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Comment created successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: 'f1e2d3c4-b5a6-4789-9012-3456789abcde',
                    taskId: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                    authorId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                    body: 'Verified endpoint behavior in local test suite.',
                    createdAt: '2026-11-23T09:00:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}/activity': {
      get: {
        tags: ['Collaboration'],
        security: [{ bearerAuth: [] }],
        summary: 'Get task audit activity log',
        description: 'Returns chronological activity events (comment creation, status changes, updates) for a task.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        responses: {
          '200': {
            description: 'Activity log records',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: 'aa11bb22-cc33-44dd-ee55-ff66aa77bb88',
                      taskId: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                      actorId: 'c4b82d41-3b7d-472e-84cf-26f5f9bf723c',
                      action: 'COMMENT_CREATED',
                      metadata: { commentId: 'f1e2d3c4-b5a6-4789-9012-3456789abcde' },
                      createdAt: '2026-11-23T09:00:00.000Z',
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}/attachments': {
      post: {
        tags: ['Collaboration'],
        security: [{ bearerAuth: [] }],
        summary: 'Register task attachment metadata',
        description: 'Stores metadata and pre-signed reference for file attachments associated with a task.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['filename', 'contentType', 'sizeBytes'],
                properties: {
                  filename: { type: 'string', minLength: 1, maxLength: 255, example: 'architecture_diagram.png' },
                  contentType: { type: 'string', example: 'image/png' },
                  sizeBytes: { type: 'integer', minimum: 1, maximum: 52428800, example: 1048576 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Attachment recorded successfully',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: '98765432-abcd-ef01-2345-6789abcdef01',
                    taskId: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991',
                    filename: 'architecture_diagram.png',
                    contentType: 'image/png',
                    sizeBytes: 1048576,
                    createdAt: '2026-11-23T09:10:00.000Z',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/tasks/{taskId}/reminders': {
      post: {
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        summary: 'Schedule a task reminder',
        description: 'Schedules an asynchronous task reminder job via persistent transactional outbox pattern. Emits a notification outbox event.',
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '9a22f3e4-6d9b-41f2-b7e1-8f5bc645e991' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idempotencyKey', 'deliverAt'],
                properties: {
                  idempotencyKey: { type: 'string', minLength: 1, maxLength: 128, example: 'reminder-user-123-task-456-step-1' },
                  deliverAt: { type: 'string', format: 'date-time', example: '2026-11-24T09:00:00.000Z' },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Reminder accepted and queued in persistent outbox',
            content: {
              'application/json': {
                example: {
                  data: {
                    id: 'e0123456-789a-bcde-f012-3456789abcde',
                    type: 'TASK_REMINDER',
                    status: 'PENDING',
                    runAt: '2026-11-24T09:00:00.000Z',
                  },
                  meta: { worker: 'persistent-outbox-active' },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/events': {
      get: {
        tags: ['Real-Time & Updates'],
        summary: 'Subscribe to real-time events via Server-Sent Events (SSE)',
        description: 'Streams live task changes, comments, subtasks, and notification events scoped to the authenticated user\'s organization. Supports reconnection via Last-Event-ID header and token query parameter fallback for standard browser EventSource.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'Last-Event-ID',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Identifier of the last received event for replaying missed events',
          },
          {
            name: 'token',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Bearer token query parameter fallback for standard browser EventSource connections',
          },
        ],
        responses: {
          '200': {
            description: 'Active event stream',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  example: 'id: 123e4567-e89b-12d3-a456-426614174000\nevent: task.created\ndata: {"id":"123","type":"task.created","payload":{"id":"task-1","title":"New Task"}}\n\n',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
  },
};

/**
 * Generates interactive Swagger UI HTML page pointing to the given OpenAPI JSON endpoint.
 */
export function renderSwaggerUiHtml(specUrl = '/api/v1/openapi.json', title = 'WorkSphere API Documentation'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232563eb'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar {
      display: none !important;
    }
    .worksphere-header {
      background: #0f172a;
      color: #ffffff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .worksphere-header .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .worksphere-header .brand span {
      background: #2563eb;
      color: white;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .worksphere-header .links a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.875rem;
      margin-left: 16px;
      transition: color 0.15s ease;
    }
    .worksphere-header .links a:hover {
      color: #ffffff;
    }
    #swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px;
    }
  </style>
</head>
<body>
  <header class="worksphere-header">
    <div class="brand">
      WorkSphere API <span>v1.0.0</span>
    </div>
    <nav class="links">
      <a href="${specUrl}" target="_blank" rel="noopener noreferrer">Raw OpenAPI JSON</a>
      <a href="/health" target="_blank">Health</a>
      <a href="/ready" target="_blank">Readiness</a>
      <a href="/metrics" target="_blank">Metrics</a>
    </nav>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: 'list'
      });
    };
  </script>
</body>
</html>`;
}
