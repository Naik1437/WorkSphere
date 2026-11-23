import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { verifyWebhookSignature, webhookSignature } from '../src/integrations.js';
import { notificationEventKey, planRetry } from '../src/jobs.js';

describe('credential and automation primitives', () => {
  it('hashes and verifies passwords without accepting another password', async () => {
    const hash = await hashPassword('a-long-enough-test-password');
    await expect(verifyPassword('a-long-enough-test-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('another-long-enough-password', hash)).resolves.toBe(false);
  });
  it('uses stable idempotency keys and bounded retries', () => {
    expect(notificationEventKey('task-1', 'task.updated', 2)).toBe('task-1:task.updated:2');
    expect(planRetry(2)).toEqual({ retry: true, delaySeconds: 4, deadLetter: false });
    expect(planRetry(5)).toEqual({ retry: false, delaySeconds: 0, deadLetter: true });
  });
  it('verifies signed webhook bodies', () => {
    const body = '{"event":"demo"}';
    const signature = webhookSignature('test-secret', body);
    expect(verifyWebhookSignature('test-secret', body, signature)).toBe(true);
    expect(verifyWebhookSignature('test-secret', '{"event":"other"}', signature)).toBe(false);
  });
});
