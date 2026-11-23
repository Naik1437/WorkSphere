/* eslint-disable @typescript-eslint/no-explicit-any -- worker accepts lightweight Prisma-compatible test doubles. */
import { PrismaClient } from '@prisma/client';
import { ConsoleEmailAdapter, type EmailAdapter } from './integrations.js';
import { planRetry } from './jobs.js';

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
): Promise<{ status: 'completed' | 'retrying' | 'dead_letter'; attempts: number }> {
  try {
    if (job.type.startsWith('notification.')) {
      await email.send({
        to: job.payload?.email ?? 'demo-recipient@localhost',
        subject: `WorkSphere ${job.type}`,
        text: JSON.stringify(job.payload),
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
  const email = new ConsoleEmailAdapter();
  const timer = setInterval(() => {
    void processNextJob(prisma, email).catch((err) => {
      console.error('Worker loop error:', err);
    });
  }, 1000);
  const shutdown = async () => {
    clearInterval(timer);
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
