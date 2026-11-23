/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */
import { notificationEventKey } from '../jobs.js';

export interface TaskFilterOptions {
  projectId: string;
  status?: string;
  assignedId?: string;
}

export class TaskRepository {
  constructor(private readonly db: any) {}

  public async findById(id: string, organizationId?: string) {
    if (!this.db?.task?.findFirst) return null;
    return this.db.task.findFirst({
      where: {
        id,
        ...(organizationId ? { project: { organizationId } } : {}),
      },
      include: { project: true },
    });
  }

  public async listByProject(options: TaskFilterOptions) {
    if (!this.db?.task?.findMany) return [];
    return this.db.task.findMany({
      where: {
        projectId: options.projectId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.assignedId ? { assignedId: options.assignedId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async createWithTransaction(data: {
    title: string;
    description?: string;
    projectId: string;
    assignedId?: string;
    parentId?: string;
    actorId: string;
  }) {
    const execute = async (tx: any) => {
      const created = await tx.task.create({
        data: {
          title: data.title,
          description: data.description,
          projectId: data.projectId,
          assignedId: data.assignedId,
          parentId: data.parentId,
          status: 'TODO',
          version: 1,
        },
      });

      if (tx.activity?.create) {
        await tx.activity.create({
          data: {
            taskId: created.id,
            actorId: data.actorId,
            eventType: data.parentId ? 'subtask.created' : 'task.created',
            payload: {
              title: created.title,
              ...(data.parentId ? { parentTaskId: data.parentId } : {}),
            },
          },
        });
      }

      if (tx.job?.create) {
        await tx.job.create({
          data: {
            idempotencyKey: notificationEventKey(
              created.id,
              data.parentId ? 'subtask.created' : 'task.created',
              created.version,
            ),
            type: data.parentId ? 'notification.subtask-created' : 'notification.task-created',
            payload: {
              taskId: created.id,
              ...(data.parentId ? { parentTaskId: data.parentId } : {}),
              userId: data.actorId,
            },
          },
        });
      }

      return created;
    };

    if (this.db?.$transaction) {
      return this.db.$transaction(execute);
    }
    return execute(this.db);
  }

  public async updateWithVersionAndTransaction(
    taskId: string,
    currentVersion: number,
    updateData: Record<string, any>,
    actorId: string,
  ) {
    const changed = await this.db.task.updateMany({
      where: { id: taskId, version: currentVersion },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    if (!changed || changed.count === 0) {
      return null;
    }

    const execute = async (tx: any) => {
      const record = tx.task.findUnique
        ? await tx.task.findUnique({ where: { id: taskId } })
        : await tx.task.findFirst({ where: { id: taskId } });

      if (tx.activity?.create) {
        await tx.activity.create({
          data: {
            taskId,
            actorId,
            eventType: 'task.updated',
            payload: { version: currentVersion + 1, ...updateData },
          },
        });
      }

      if (tx.job?.create) {
        await tx.job.create({
          data: {
            idempotencyKey: notificationEventKey(taskId, 'task.updated', currentVersion + 1),
            type: 'notification.task-updated',
            payload: { taskId, userId: actorId },
          },
        });
      }

      return record;
    };

    if (this.db?.$transaction) {
      return this.db.$transaction(execute);
    }
    return execute(this.db);
  }

  public async delete(id: string) {
    return this.db.task.delete({ where: { id } });
  }

  public async listSubtasks(parentTaskId: string) {
    if (!this.db?.task?.findMany) return [];
    return this.db.task.findMany({
      where: { parentId: parentTaskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async addCommentWithTransaction(taskId: string, authorId: string, content: string) {
    const execute = async (tx: any) => {
      const created = await tx.comment.create({
        data: { taskId, authorId, body: content },
      });

      if (tx.activity?.create) {
        await tx.activity.create({
          data: {
            taskId,
            actorId: authorId,
            eventType: 'comment.created',
            payload: { commentId: created.id },
          },
        });
      }

      return created;
    };

    if (this.db?.$transaction) {
      return this.db.$transaction(execute);
    }
    return execute(this.db);
  }

  public async listActivity(taskId: string) {
    if (!this.db?.activity?.findMany) return [];
    return this.db.activity.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
