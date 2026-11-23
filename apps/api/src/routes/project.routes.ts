import { Router, type RequestHandler } from 'express';
import { ProjectController } from '../controllers/project.controller.js';
import { TaskController } from '../controllers/task.controller.js';

export function createProjectRouter(
  projectController: ProjectController,
  taskController: TaskController,
  middleware: {
    authenticate: RequestHandler;
    requireDb: RequestHandler;
    requireRole: (roles: string[]) => RequestHandler;
  },
): Router {
  const router = Router();
  const { authenticate, requireDb, requireRole } = middleware;

  // Projects CRUD
  router.get('/projects', authenticate, requireDb, projectController.listProjects);
  router.get('/projects/:projectId', authenticate, requireDb, projectController.getProject);
  router.post(
    '/projects',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    projectController.createProject,
  );
  router.patch(
    '/projects/:projectId',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    projectController.updateProject,
  );
  router.delete(
    '/projects/:projectId',
    authenticate,
    requireDb,
    requireRole(['OWNER']),
    projectController.deleteProject,
  );

  // Project Milestones
  router.get(
    '/projects/:projectId/milestones',
    authenticate,
    requireDb,
    projectController.listMilestones,
  );
  router.post(
    '/projects/:projectId/milestones',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    projectController.createMilestone,
  );

  // Project Tasks
  router.get('/projects/:projectId/tasks', authenticate, requireDb, taskController.listTasks);
  router.post(
    '/projects/:projectId/tasks',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER', 'MEMBER']),
    taskController.createTask,
  );

  return router;
}
