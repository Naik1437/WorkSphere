/* eslint-disable @typescript-eslint/no-explicit-any -- worker accepts lightweight Prisma-compatible test doubles. */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConsoleEmailAdapter,
  ConsoleWebhookAdapter,
  createEmailAdapterFromEnv,
  type EmailAdapter,
  type WebhookAdapter,
} from './integrations.js';
import { planRetry } from './jobs.js';

export const WORKER_HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE || join(tmpdir(), 'worksphere-worker-heartbeat');

export function recordWorkerHeartbeat(filePath: string = WORKER_HEARTBEAT_FILE): void {
  try {
    writeFileSync(filePath, Date.now().toString(), 'utf-8');
  } catch {
    // Non-fatal if filesystem is restricted
  }
}

export function checkWorkerHeartbeat(
  maxAgeMs = 30000,
  filePath: string = WORKER_HEARTBEAT_FILE,
): { healthy: boolean; lastHeartbeatMs: number | null; ageMs: number | null } {
  try {
    if (!existsSync(filePath)) {
      return { healthy: false, lastHeartbeatMs: null, ageMs: null };
    }
    const content = readFileSync(filePath, 'utf-8');
    const timestamp = parseInt(content.trim(), 10);
    if (isNaN(timestamp)) {
      return { healthy: false, lastHeartbeatMs: null, ageMs: null };
    }
    const ageMs = Date.now() - timestamp;
    return { healthy: ageMs <= maxAgeMs, lastHeartbeatMs: timestamp, ageMs };
  } catch {
    return { healthy: false, lastHeartbeatMs: null, ageMs: null };
  }
}

export interface WorkerPrisma {
  job: {
    findFirst: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  $disconnect?: () => Promise<void>;
}

export async function processJob(
  prisma: WorkerPrisma,
  email: EmailAdapter,
  job: any,
  webhook?: WebhookAdapter,
): Promise<{ status: 'completed' | 'retrying' | 'dead_letter'; attempts: number }> {
  try {
    if (job.type.startsWith('notification.')) {
      await email.send({
        to: job.payload?.email ?? 'demo-recipient@localhost',
        subject: `WorkSphere ${job.type}`,
        text: JSON.stringify(job.payload),
        idempotencyKey: job.idempotencyKey,
      });
    } else if (job.type.startsWith('webhook.') || job.type === 'webhook.dispatch') {
      const webhookAdapter = webhook ?? new ConsoleWebhookAdapter();
      await webhookAdapter.dispatch({
        targetUrl: job.payload?.targetUrl ?? 'https://localhost/webhook',
        secret: job.payload?.secret ?? 'default-webhook-secret',
        event: job.payload?.event ?? job.type,
        payload: job.payload?.payload ?? {},
        idempotencyKey: job.idempotencyKey,
      });
    }
    const nextAttempts = job.attempts + 1;
    await prisma.job.update({
      where: { id: job.id },
      data: { completedAt: new Date(), attempts: nextAttempts },
    });
    return { status: 'completed', attempts: nextAttempts };
  } catch (error) {
    const nextAttempts = job.attempts + 1;
    const retry = planRetry(nextAttempts);
    const errorMessage = error instanceof Error ? error.message : 'Unknown worker error';
    await prisma.job.update({
      where: { id: job.id },
      data: retry.deadLetter
        ? { attempts: nextAttempts, failedAt: new Date(), lastError: errorMessage }
        : {
            attempts: nextAttempts,
            availableAt: new Date(Date.now() + retry.delaySeconds * 1000),
            lastError: errorMessage,
          },
    });
    return { status: retry.deadLetter ? 'dead_letter' : 'retrying', attempts: nextAttempts };
  }
}

export async function processNextJob(
  prisma: WorkerPrisma,
  email: EmailAdapter,
): Promise<{ status: 'completed' | 'retrying' | 'dead_letter'; attempts: number } | null> {
  try {
    const job = await prisma.job.findFirst({
      where: { completedAt: null, failedAt: null, availableAt: { lte: new Date() } },
      orderBy: { availableAt: 'asc' },
    });
    if (!job) return null;
    return processJob(prisma, email, job);
  } catch (error: any) {
    if (error?.code === 'P2021') {
      console.warn('Jobs table does not exist yet (P2021). Waiting for database migrations...');
      return null;
    }
    throw error;
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker.ts'));
if (isMain) {
  const prisma = new PrismaClient();
  const email = createEmailAdapterFromEnv();
  recordWorkerHeartbeat();
  const timer = setInterval(() => {
    recordWorkerHeartbeat();
    void processNextJob(prisma, email).catch((err) => {
      console.error('Worker loop error:', err);
    });
  }, 1000);
  const shutdown = async () => {
    clearInterval(timer);
    try {
      unlinkSync(WORKER_HEARTBEAT_FILE);
    } catch {
      // ignore
    }
    if (prisma.$disconnect) await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  void processNextJob(prisma, email).catch((err) => {
    console.error('Initial worker error:', err);
  });
  console.log('WorkSphere outbox worker started');
}
