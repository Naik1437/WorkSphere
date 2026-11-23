export type RetryPlan = { retry: boolean; delaySeconds: number; deadLetter: boolean };

/** Deterministic retry policy used by a persistent outbox/worker implementation. */
export function planRetry(attempts: number, maximumAttempts = 5): RetryPlan {
  if (attempts >= maximumAttempts) return { retry: false, delaySeconds: 0, deadLetter: true };
  return { retry: true, delaySeconds: Math.min(900, 2 ** attempts), deadLetter: false };
}

export function notificationEventKey(taskId: string, eventType: string, version: number): string {
  return `${taskId}:${eventType}:${version}`;
}
