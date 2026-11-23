import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProjectService } from '../services/project.service.js';

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  public listProjects = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = (req as any).identity;
      const projects = await this.projectService.listProjects(identity.organizationId);
      return res.json({ data: projects });
    } catch (err) {
      return next(err);
    }
  };

  public getProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const identity = (req as any).identity;
      const project = await this.projectService.getProject(projectId, identity.organizationId);
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: project });
    } catch (err) {
      return next(err);
    }
  };

  public createProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const identity = (req as any).identity;
      const project = await this.projectService.createProject(
        identity.organizationId,
        input.data,
        identity.userId,
      );
      return res.status(201).json({ data: project });
    } catch (err) {
      return next(err);
    }
  };

  public updateProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const schema = z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const identity = (req as any).identity;
      const project = await this.projectService.updateProject(
        projectId,
        identity.organizationId,
        input.data,
        identity.userId,
      );
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: project });
    } catch (err) {
      return next(err);
    }
  };

  public deleteProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const identity = (req as any).identity;
      const project = await this.projectService.deleteProject(
        projectId,
        identity.organizationId,
        identity.userId,
      );
      if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  };

  public listMilestones = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const identity = (req as any).identity;
      const milestones = await this.projectService.listMilestones(projectId, identity.organizationId);
      if (!milestones) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: milestones });
    } catch (err) {
      return next(err);
    }
  };

  public createMilestone = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId as string;
      const schema = z.object({
        name: z.string().min(1).max(160),
        dueAt: z.string().datetime().optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const identity = (req as any).identity;
      const milestone = await this.projectService.createMilestone(
        projectId,
        identity.organizationId,
        {
          title: input.data.name,
          dueAt: input.data.dueAt ? new Date(input.data.dueAt) : undefined,
        },
      );
      if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(201).json({ data: milestone });
    } catch (err) {
      return next(err);
    }
  };
}
