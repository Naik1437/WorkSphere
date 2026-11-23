import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface SubscriptionPlan {
  id: PlanTier;
  name: string;
  description: string;
  priceMonthlyUsd: number;
  maxMembers: number;
  maxProjects: number;
  features: string[];
}

export const WORKSPHERE_PLANS: Record<PlanTier, SubscriptionPlan> = {
  FREE: {
    id: 'FREE',
    name: 'WorkSphere Community',
    description: 'Essential task and project collaboration for small teams and open source.',
    priceMonthlyUsd: 0,
    maxMembers: 5,
    maxProjects: 10,
    features: [
      'Kanban & List views',
      'Activity audit stream',
      'Community forum support',
      'Basic webhooks',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'WorkSphere Professional',
    description:
      'Advanced project orchestration, analytics, and integrations for growing companies.',
    priceMonthlyUsd: 29,
    maxMembers: 25,
    maxProjects: 100,
    features: [
      'Everything in Free',
      'S3/MinIO attachment storage',
      'Python analytics engine',
      'Real-time SSE events',
      'Priority email support',
    ],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'WorkSphere Enterprise',
    description: 'High-assurance security, dedicated multi-tenant infrastructure, and SLA.',
    priceMonthlyUsd: 199,
    maxMembers: -1, // Unlimited
    maxProjects: -1, // Unlimited
    features: [
      'Everything in Pro',
      'Unlimited members & projects',
      'Full audit logging',
      'Custom role-based permissions',
      '24/7 dedicated SLA support',
    ],
  },
};

export interface BillingWebhookResult {
  valid: boolean;
  event?: {
    id: string;
    type: string;
    organizationId?: string;
    planId?: PlanTier;
    status?: string;
    data: Record<string, any>;
  };
  error?: string;
}

/**
 * Verifies standard Stripe test-mode webhook signatures (format: t=timestamp,v1=signature).
 * Uses timingSafeEqual to avoid timing attack vulnerabilities.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, item) => {
    const [k, v] = item.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Protect against replay attacks beyond tolerance
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);
  if (isNaN(eventTime) || Math.abs(now - eventTime) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');

  const actualBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');

  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

export interface BillingAdapter {
  getPlans(): SubscriptionPlan[];
  createCheckoutSession(input: {
    organizationId: string;
    planId: PlanTier;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionUrl: string; sessionId: string; mode: 'sandbox' | 'mock' }>;
  verifyAndParseWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret?: string,
  ): BillingWebhookResult;
}

export class SandboxStripeBillingAdapter implements BillingAdapter {
  private readonly secretKey?: string;
  private readonly webhookSecret: string;

  constructor(secretKey?: string, webhookSecret?: string) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret || 'whsec_test_mock_secret_for_worksphere';
  }

  getPlans(): SubscriptionPlan[] {
    return Object.values(WORKSPHERE_PLANS);
  }

  async createCheckoutSession(input: {
    organizationId: string;
    planId: PlanTier;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionUrl: string; sessionId: string; mode: 'sandbox' | 'mock' }> {
    const sessionId = `cs_test_${randomUUID().replace(/-/g, '')}`;
    // Construct sandbox checkout URL without collecting real cards
    const sessionUrl = `https://checkout.stripe.com/c/pay/${sessionId}#test_mode&org=${encodeURIComponent(input.organizationId)}&plan=${input.planId}`;

    return {
      sessionUrl,
      sessionId,
      mode: 'sandbox',
    };
  }

  verifyAndParseWebhook(
    rawBody: string,
    signatureHeader: string,
    customSecret?: string,
  ): BillingWebhookResult {
    const secret = customSecret || this.webhookSecret;
    const isValid = verifyStripeWebhookSignature(rawBody, signatureHeader, secret);
    if (!isValid) {
      return { valid: false, error: 'INVALID_SIGNATURE' };
    }

    try {
      const parsed = JSON.parse(rawBody);
      const eventId = parsed.id || `evt_${randomUUID()}`;
      const eventType = parsed.type || 'unknown';
      const orgId =
        parsed.data?.object?.client_reference_id ||
        parsed.data?.object?.metadata?.organizationId ||
        parsed.data?.object?.customer_metadata?.organizationId;
      const planId = parsed.data?.object?.metadata?.planId as PlanTier | undefined;

      return {
        valid: true,
        event: {
          id: eventId,
          type: eventType,
          organizationId: orgId,
          planId: planId ?? 'PRO',
          status: parsed.data?.object?.status || 'active',
          data: parsed.data?.object || {},
        },
      };
    } catch {
      return { valid: false, error: 'MALFORMED_PAYLOAD' };
    }
  }
}

export class MockBillingAdapter implements BillingAdapter {
  getPlans(): SubscriptionPlan[] {
    return Object.values(WORKSPHERE_PLANS);
  }

  async createCheckoutSession(input: {
    organizationId: string;
    planId: PlanTier;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionUrl: string; sessionId: string; mode: 'sandbox' | 'mock' }> {
    const sessionId = `mock_session_${randomUUID()}`;
    return {
      sessionUrl: `${input.successUrl}?session_id=${sessionId}&plan=${input.planId}`,
      sessionId,
      mode: 'mock',
    };
  }

  verifyAndParseWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret?: string,
  ): BillingWebhookResult {
    // If a signature is provided, verify using standard HMAC or accept mock header
    if (signatureHeader.startsWith('t=')) {
      const isValid = verifyStripeWebhookSignature(
        rawBody,
        signatureHeader,
        webhookSecret || 'whsec_test_mock_secret_for_worksphere',
      );
      if (!isValid) return { valid: false, error: 'INVALID_SIGNATURE' };
    }

    try {
      const parsed = JSON.parse(rawBody);
      return {
        valid: true,
        event: {
          id: parsed.id || `evt_${randomUUID()}`,
          type: parsed.type || 'customer.subscription.created',
          organizationId: parsed.data?.organizationId,
          planId: parsed.data?.planId || 'PRO',
          status: 'active',
          data: parsed.data || {},
        },
      };
    } catch {
      return { valid: false, error: 'MALFORMED_PAYLOAD' };
    }
  }
}

export function createBillingAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): BillingAdapter {
  if (env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET) {
    return new SandboxStripeBillingAdapter(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }
  return new MockBillingAdapter();
}
