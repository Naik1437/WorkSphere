/* eslint-disable @typescript-eslint/no-explicit-any -- Accepts lightweight Prisma-compatible test doubles */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TeamService } from '../services/team.service.js';

export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly db?: any,
  ) {}

  public listTeams = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = (req as any).identity;
      const teams = await this.teamService.listTeams(identity.organizationId);
      return res.json({ data: teams });
    } catch (err) {
      return next(err);
    }
  };

  public createTeam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const identity = (req as any).identity;
      const team = await this.teamService.createTeam(identity.organizationId, input.data);
      return res.status(201).json({ data: team });
    } catch (err) {
      return next(err);
    }
  };

  public addMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const teamId = req.params.teamId as string;
      const schema = z.object({
        userId: z.string().uuid(),
        role: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
      });
      const input = schema.safeParse(req.body);
      if (!input.success) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', details: input.error.errors } });
      }

      const identity = (req as any).identity;

      // Verify team belongs to tenant
      const team = await this.teamService.getTeam(teamId, identity.organizationId);
      if (!team) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      // Verify candidate user belongs to tenant organization
      if (this.db?.membership) {
        const member = this.db.membership.findUnique
          ? await this.db.membership.findUnique({
              where: {
                organizationId_userId: {
                  organizationId: identity.organizationId,
                  userId: input.data.userId,
                },
              },
            })
          : await this.db.membership.findFirst({
              where: { organizationId: identity.organizationId, userId: input.data.userId },
            });
        if (!member) {
          return res.status(400).json({ error: { code: 'USER_NOT_IN_ORGANIZATION' } });
        }
      }

      const membership = await this.teamService.addMember(
        teamId,
        identity.organizationId,
        input.data.userId,
        input.data.role,
      );
      if (!membership) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.status(201).json({ data: membership });
    } catch (err) {
      return next(err);
    }
  };

  public listMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const teamId = req.params.teamId as string;
      const identity = (req as any).identity;
      const members = await this.teamService.listMembers(teamId, identity.organizationId);
      if (!members) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return res.json({ data: members });
    } catch (err) {
      return next(err);
    }
  };
}
