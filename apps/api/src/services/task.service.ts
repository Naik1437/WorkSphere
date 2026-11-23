import { TaskRepository } from '../repositories/task.repository.js';
import { RealtimeBroadcaster } from '../events.js';

export class TaskService {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly events?: RealtimeBroadcaster,
  ) {}

  public async getTask(taskId: string, organizationId?: string) {
    return this.taskRepo.findById(taskId, organizationId);
  }

  public async listTasks(projectId: string, status?: string, assignedId?: string) {
    return this.taskRepo.listByProject({ projectId, status, assignedId });
  }

  public async createTask(data: {
    title: string;
    description?: string;
    projectId: string;
    assignedId?: string;
    parentId?: string;
    organizationId: string;
    actorId: string;
  }) {
    if (data.parentId) {
      const parent = await this.taskRepo.findById(data.parentId);
      if (!parent || parent.projectId !== data.projectId) {
        throw new Error('INVALID_PARENT_TASK');
      }
    }

    const task = await this.taskRepo.createWithTransaction({
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      assignedId: data.assignedId,
      parentId: data.parentId,
      actorId: data.actorId,
    });

    this.events?.publish(data.organizationId, {
      type: 'task.created',
      payload: task,
      actorId: data.actorId,
    });

    return task;
  }

  public async updateTask(
    taskId: string,
    organizationId: string,
    input: {
      version: number;
      title?: string;
      description?: string;
      status?: string;
      assignedId?: string | null;
      parentId?: string | null;
    },
    actorId: string,
  ) {
    const task = await this.taskRepo.findById(taskId, organizationId);
    if (!task) return null;

    // A12-R06: Validate parentId to prevent self-cycles and cross-project / cross-tenant IDOR
    if (input.parentId !== undefined) {
      if (input.parentId === task.id) {
        throw new Error('INVALID_PARENT_TASK');
      }
      if (input.parentId !== null) {
        const parentTask = await this.taskRepo.findById(input.parentId);
        if (!parentTask || parentTask.projectId !== task.projectId) {
          throw new Error('INVALID_PARENT_TASK');
        }
      }
    }

    const updateData: Record<string, any> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.assignedId !== undefined) updateData.assignedId = input.assignedId;
    if (input.parentId !== undefined) updateData.parentId = input.parentId;

    const updated = await this.taskRepo.updateWithVersionAndTransaction(
      task.id,
      input.version,
      updateData,
      actorId,
    );

    if (!updated) {
      throw new Error('VERSION_CONFLICT');
    }

    this.events?.publish(organizationId, {
      type: 'task.updated',
      payload: updated,
      actorId,
    });

    return updated;
  }

  public async deleteTask(taskId: string, organizationId: string, actorId?: string) {
    const task = await this.taskRepo.findById(taskId, organizationId);
    if (!task) return null;

    await this.taskRepo.delete(task.id);

    this.events?.publish(organizationId, {
      type: 'task.deleted',
      payload: { taskId: task.id, projectId: task.projectId },
      actorId,
    });

    return task;
  }

  public async listSubtasks(parentTaskId: string, organizationId: string) {
    const parent = await this.taskRepo.findById(parentTaskId, organizationId);
    if (!parent) return null;
    return this.taskRepo.listSubtasks(parent.id);
  }

  public async createSubtask(
    parentTaskId: string,
    organizationId: string,
    data: { title: string; description?: string; assignedId?: string },
    actorId: string,
  ) {
    const parent = await this.taskRepo.findById(parentTaskId, organizationId);
    if (!parent) return null;

    const subtask = await this.taskRepo.createWithTransaction({
      title: data.title,
      description: data.description,
      projectId: parent.projectId,
      assignedId: data.assignedId,
      parentId: parent.id,
      actorId,
    });

    this.events?.publish(organizationId, {
      type: 'subtask.created',
      payload: subtask,
      actorId,
    });

    return subtask;
  }

  public async addComment(
    taskId: string,
    organizationId: string,
    content: string,
    authorId: string,
  ) {
    const task = await this.taskRepo.findById(taskId, organizationId);
    if (!task) return null;

    const comment = await this.taskRepo.addCommentWithTransaction(task.id, authorId, content);

    this.events?.publish(organizationId, {
      type: 'comment.created',
      payload: { ...comment, taskId: task.id, projectId: task.projectId },
      actorId: authorId,
    });

    return comment;
  }

  public async listActivity(taskId: string, organizationId: string) {
    const task = await this.taskRepo.findById(taskId, organizationId);
    if (!task) return null;
    return this.taskRepo.listActivity(task.id);
  }
}
