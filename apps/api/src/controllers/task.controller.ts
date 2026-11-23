import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TaskService } from '../services/task.service.js';
import { ProjectService } from '../services/project.service.js';

export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly projectService?: ProjectService,
  ) {}

  public getTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;
      const task = await this.taskService.getTask(taskId, identity?.organizationId);
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: task });
    } catch (err) {
      return next(err);
    }
  };

  public listTasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const identity = (req as any).identity;

      if (this.projectService) {
        const project = await this.projectService.getProject(projectId, identity.organizationId);
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      }

      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const assignedId =
        typeof req.query.assignedId === 'string' ? req.query.assignedId : undefined;
      const tasks = await this.taskService.listTasks(projectId, status, assignedId);
      return res.json({ data: tasks });
    } catch (err) {
      return next(err);
    }
  };

  public createTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const identity = (req as any).identity;

      if (identity?.role === 'AUDITOR') {
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      }

      if (this.projectService) {
        const project = await this.projectService.getProject(projectId, identity.organizationId);
        if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      }

      const schema = z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(4000).optional(),
        assignedId: z.string().uuid().optional(),
        parentId: z.string().uuid().optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      try {
        const task = await this.taskService.createTask({
          title: input.data.title,
          description: input.data.description,
          projectId,
          assignedId: input.data.assignedId,
          parentId: input.data.parentId,
          organizationId: identity?.organizationId,
          actorId: identity?.userId ?? 'system',
        });
        return res.status(201).json({ data: task });
      } catch (err: any) {
        if (err.message === 'INVALID_PARENT_TASK') {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARENT_TASK',
              message: 'Parent task must belong to the same project',
            },
          });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  };

  public updateTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;

      const schema = z.object({
        version: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(4000).optional(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
        assignedId: z.string().uuid().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      try {
        const updated = await this.taskService.updateTask(
          taskId,
          identity?.organizationId,
          input.data,
          identity?.userId ?? 'system',
        );
        if (!updated) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
        return res.json({ data: updated });
      } catch (err: any) {
        if (err.message === 'INVALID_PARENT_TASK') {
          return res
            .status(400)
            .json({ error: { code: 'INVALID_PARENT_TASK', message: 'Invalid parent task' } });
        }
        if (err.message === 'VERSION_CONFLICT') {
          return res.status(409).json({
            error: { code: 'VERSION_CONFLICT', message: 'Task changed; reload before retrying' },
          });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  };

  public deleteTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;
      if (!['OWNER', 'MANAGER'].includes(identity.role)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      }
      const task = await this.taskService.deleteTask(
        taskId,
        identity?.organizationId,
        identity?.userId,
      );
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  };

  public listSubtasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;
      const subtasks = await this.taskService.listSubtasks(taskId, identity?.organizationId);
      if (!subtasks) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: subtasks });
    } catch (err) {
      return next(err);
    }
  };

  public createSubtask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;
      if (identity?.role === 'AUDITOR') {
        return res.status(403).json({ error: { code: 'FORBIDDEN' } });
      }

      const schema = z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(4000).optional(),
        assignedId: z.string().uuid().optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const subtask = await this.taskService.createSubtask(
        taskId,
        identity?.organizationId,
        input.data,
        identity?.userId ?? 'system',
      );
      if (!subtask) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(201).json({ data: subtask });
    } catch (err) {
      return next(err);
    }
  };

  public addComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;

      const task = await this.taskService.getTask(taskId, identity?.organizationId);
      if (!task) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const schema = z
        .object({
          content: z.string().min(1).max(4000).optional(),
          body: z.string().min(1).max(4000).optional(),
        })
        .refine((data) => Boolean(data.content || data.body), {
          message: 'Must provide content or body',
        });

      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const text = (input.data.body || input.data.content)!;
      const comment = await this.taskService.addComment(
        task.id,
        identity?.organizationId,
        text,
        identity?.userId ?? 'system',
      );
      if (!comment) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(201).json({ data: comment });
    } catch (err) {
      return next(err);
    }
  };

  public listActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.taskId as string;
      const identity = (req as any).identity;
      const activity = await this.taskService.listActivity(taskId, identity?.organizationId);
      if (!activity) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: activity });
    } catch (err) {
      return next(err);
    }
  };
}
