import { Router } from 'express';
import { TaskController } from '../controllers/task.controller.js';

export function createTaskRouter(
  taskController: TaskController,
  middleware: {
    authenticate: any;
    requireDb: any;
    requireRole: (roles: string[]) => any;
  },
): Router {
  const router = Router();
  const { authenticate, requireDb, requireRole } = middleware;

  // Task CRUD
  router.get('/tasks/:taskId', authenticate, requireDb, taskController.getTask);
  router.patch(
    '/tasks/:taskId',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER', 'MEMBER']),
    taskController.updateTask,
  );
  router.delete(
    '/tasks/:taskId',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER']),
    taskController.deleteTask,
  );

  // Subtasks & Comments & Activity
  router.get('/tasks/:taskId/subtasks', authenticate, requireDb, taskController.listSubtasks);
  router.post(
    '/tasks/:taskId/subtasks',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER', 'MEMBER']),
    taskController.createSubtask,
  );
  router.post(
    '/tasks/:taskId/comments',
    authenticate,
    requireDb,
    requireRole(['OWNER', 'MANAGER', 'MEMBER']),
    taskController.addComment,
  );
  router.get('/tasks/:taskId/activity', authenticate, requireDb, taskController.listActivity);

  return router;
}
