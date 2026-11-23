import { createHmac, timingSafeEqual } from 'node:crypto';

/** Local/demo adapter contracts; providers are selected by deployment configuration. */
export interface EmailAdapter {
  send(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<void>;
}
export interface StorageAdapter {
  createUpload(input: { key: string; contentType: string }): Promise<{ uploadUrl: string }>;
}

export function webhookSignature(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(webhookSignature(secret, body), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class ConsoleEmailAdapter implements EmailAdapter {
  async send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    console.info(
      JSON.stringify({
        adapter: 'console-email',
        to: input.to,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }
}
