/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { processJob, processNextJob, type WorkerPrisma } from '../src/worker.js';
import type { EmailAdapter } from '../src/integrations.js';

describe('persistent outbox worker', () => {
  it('processes notification jobs, sends email, and marks job completed', async () => {
    const updatedRecords: any[] = [];
    const mockPrisma: WorkerPrisma = {
      job: {
        findFirst: vi.fn(),
        update: vi.fn().mockImplementation(async (args) => {
          updatedRecords.push(args);
          return args.data;
        }),
      },
    };

    const sentEmails: any[] = [];
    const mockEmail: EmailAdapter = {
      send: vi.fn().mockImplementation(async (input) => {
        sentEmails.push(input);
      }),
    };

    const testJob = {
      id: 'job-123',
      idempotencyKey: 'task-1:task.created:1',
      type: 'notification.task-created',
      payload: { taskId: 'task-1', email: 'test@example.com' },
      attempts: 0,
    };

    const result = await processJob(mockPrisma, mockEmail, testJob);
    expect(result.status).toBe('completed');
    expect(result.attempts).toBe(1);
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe('test@example.com');
    expect(sentEmails[0].idempotencyKey).toBe('task-1:task.created:1');
    expect(updatedRecords[0].data.completedAt).toBeDefined();
    expect(updatedRecords[0].data.attempts).toBe(1);
  });

  it('schedules retry with exponential delay when job handler throws', async () => {
    const updatedRecords: any[] = [];
    const mockPrisma: WorkerPrisma = {
      job: {
        findFirst: vi.fn(),
        update: vi.fn().mockImplementation(async (args) => {
          updatedRecords.push(args);
          return args.data;
        }),
      },
    };

    const failingEmail: EmailAdapter = {
      send: vi.fn().mockRejectedValue(new Error('SMTP timeout')),
    };

    const testJob = {
      id: 'job-failing',
      idempotencyKey: 'task-2:task.created:1',
      type: 'notification.task-created',
      payload: { taskId: 'task-2' },
      attempts: 1, // Next will be attempt 2
    };

    const result = await processJob(mockPrisma, failingEmail, testJob);
    expect(result.status).toBe('retrying');
    expect(result.attempts).toBe(2);
    expect(updatedRecords[0].data.lastError).toBe('SMTP timeout');
    expect(updatedRecords[0].data.availableAt).toBeDefined();
  });

  it('marks job dead-lettered when reaching maximum retry attempts', async () => {
    const updatedRecords: any[] = [];
    const mockPrisma: WorkerPrisma = {
      job: {
        findFirst: vi.fn(),
        update: vi.fn().mockImplementation(async (args) => {
          updatedRecords.push(args);
          return args.data;
        }),
      },
    };

    const failingEmail: EmailAdapter = {
      send: vi.fn().mockRejectedValue(new Error('Fatal connection refused')),
    };

    const testJob = {
      id: 'job-dead-letter',
      idempotencyKey: 'task-3:task.created:1',
      type: 'notification.task-created',
      payload: { taskId: 'task-3' },
      attempts: 4, // Next will be attempt 5 (maximumAttempts = 5)
    };

    const result = await processJob(mockPrisma, failingEmail, testJob);
    expect(result.status).toBe('dead_letter');
    expect(result.attempts).toBe(5);
    expect(updatedRecords[0].data.failedAt).toBeDefined();
    expect(updatedRecords[0].data.lastError).toBe('Fatal connection refused');
  });

  it('processNextJob queries pending job and processes it', async () => {
    const testJob = {
      id: 'job-next',
      idempotencyKey: 'task-4:task.created:1',
      type: 'notification.task-created',
      payload: { taskId: 'task-4' },
      attempts: 0,
    };

    const mockPrisma: WorkerPrisma = {
      job: {
        findFirst: vi.fn().mockResolvedValue(testJob),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockEmail: EmailAdapter = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processNextJob(mockPrisma, mockEmail);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('completed');
  });

  it('gracefully handles missing jobs table (P2021) without throwing unhandled error', async () => {
    const errorP2021 = new Error('Table public.jobs does not exist');
    (errorP2021 as any).code = 'P2021';
    const mockPrisma: WorkerPrisma = {
      job: {
        findFirst: vi.fn().mockRejectedValue(errorP2021),
        update: vi.fn(),
      },
    };
    const mockEmail: EmailAdapter = { send: vi.fn() };
    const result = await processNextJob(mockPrisma, mockEmail);
    expect(result).toBeNull();
  });
});
