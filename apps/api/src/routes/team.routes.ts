import { Router } from 'express';
import { TeamController } from '../controllers/team.controller.js';

export function createTeamRouter(
  teamController: TeamController,
  middleware: {
    authenticate: any;
    requireDb: any;
    requireRole: (roles: string[]) => any;
  },
): Router {
  const router = Router();
  const { authenticate, requireDb, requireRole } = middleware;

  router.get('/teams', authenticate, requireDb, teamController.listTeams);
  router.post(
    '/teams',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    teamController.createTeam,
  );
  router.get('/teams/:teamId/members', authenticate, requireDb, teamController.listMembers);
  router.post(
    '/teams/:teamId/members',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    teamController.addMember,
  );

  return router;
}
