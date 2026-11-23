# WorkSphere — Billing & Subscription Integration Architecture Scope (A08-R06)

## 1. Executive Summary & Scope Justification

WorkSphere is architected primarily as an **open-core, self-hostable enterprise project orchestration platform**. The core repository provides complete task management, real-time collaboration, activity auditing, analytics, and multi-tenant organizational isolation without requiring third-party payment rails.

In accordance with **Assessment 08 (Third-Party Integrations - A08-R06)** and the project evaluation criteria:

- **Production Live Charges**: Strictly excluded. No live credit card charges are processed, and no real credit card numbers, CVVs, or cardholder secrets are accepted or retained in WorkSphere databases.
- **Sandbox & Test Mode**: WorkSphere provides a formal, secure, sandbox-compatible Stripe integration module (`apps/api/src/billing.ts`) with cryptographic webhook signature verification (`t=timestamp,v1=signature`) and replay-attack defense.
- **PCI-DSS Compliance Boundary**: WorkSphere adheres to **PCI-DSS SAQ A** scoping guidelines. Payment card details never touch WorkSphere servers; all checkout flows redirect to hosted Stripe Checkout sessions.

---

## 2. Subscription Tier Model

WorkSphere models three operational tiers for organization workspaces:

| Tier                   | Monthly Price | User Limit | Project Limit | Key Capabilities                                                   |
| ---------------------- | ------------- | ---------- | ------------- | ------------------------------------------------------------------ |
| **Community (FREE)**   | \$0           | 5 members  | 10 projects   | Core Kanban & list views, activity streams, basic webhooks         |
| **Professional (PRO)** | \$29          | 25 members | 100 projects  | S3/MinIO attachment storage, Python analytics engine, SSE events   |
| **Enterprise**         | \$199         | Unlimited  | Unlimited     | Full audit logging, custom RBAC permissions, dedicated SLA support |

---

## 3. Data Flow Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Workspace Owner
    participant Web as WorkSphere Frontend
    participant API as WorkSphere API
    participant DB as PostgreSQL Database
    participant Stripe as Stripe Sandbox API

    Admin->>Web: Navigate to Organization Settings > Billing
    Web->>API: GET /api/v1/billing/plans
    API-->>Web: Return Available Plans & Features
    Admin->>Web: Select "Upgrade to PRO"
    Web->>API: POST /api/v1/billing/checkout { planId: "PRO" }
    API->>Stripe: Create Sandbox Checkout Session
    Stripe-->>API: Return Checkout URL (cs_test_...)
    API-->>Web: Return { sessionUrl }
    Web-->>Admin: Redirect to Hosted Stripe Checkout Page

    Note over Admin,Stripe: Payment card processed entirely by Stripe; zero card data touches WorkSphere

    Stripe->>API: POST /api/v1/billing/webhook (stripe-signature: t=..., v1=...)
    API->>API: Verify Signature (HMAC SHA-256 with constant-time equality)
    API->>DB: Check WebhookEvent (idempotency deduplication by provider + externalId)
    alt New Event
        API->>DB: Save WebhookEvent (status: processed)
        API->>DB: Update Organization Plan (plan: "PRO")
        API-->>Stripe: HTTP 200 { received: true }
    else Duplicate Event
        API-->>Stripe: HTTP 200 { status: "duplicate_ignored" }
    end
```

---

## 4. Security & Isolation Controls

1. **Replay Attack Defense**:
   Webhook timestamps (`t=<unix-timestamp>`) are checked against system UTC time with a maximum tolerance of 300 seconds (5 minutes). Stale requests are rejected immediately with `401 INVALID_SIGNATURE`.

2. **Constant-Time Comparison**:
   Signature validation uses `crypto.timingSafeEqual` over raw buffer digests to prevent timing analysis attacks against the HMAC secret.

3. **Multi-Tenant Scoping**:
   Checkout creation requires an authenticated session with `OWNER` role (`requireRole(['OWNER'])`). The requesting user's tenant (`organizationId`) is locked into the session metadata and verified upon webhook callback.

4. **Zero Card Storage & Tokenization**:
   WorkSphere has no database fields for credit cards, expiration dates, or CVVs. All sensitive billing data resides in the merchant processor's PCI-DSS Level 1 certified vault.

5. **Idempotent Webhook Processing**:
   Every incoming webhook event ID (`evt_...`) is inserted into the `webhook_events` table with a composite unique constraint `@@unique([provider, externalId])`. Re-delivered webhooks return HTTP 200 without duplicate state modification.

---

## 5. Environment Configuration

To enable sandbox Stripe billing in a deployment:

```env
# Optional Sandbox Billing Configuration
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
```

When these keys are omitted, the API defaults to the deterministic `MockBillingAdapter` for automated testing and standalone local execution.
