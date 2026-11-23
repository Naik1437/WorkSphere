/**
 * TanStack React Query Key Factories (A01-R08)
 * Provides consistent, type-safe query key hierarchies for server state caching.
 */
export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    list: (orgId?: string) => ['projects', 'list', orgId ?? 'all'] as const,
    detail: (projectId: string) => ['projects', 'detail', projectId] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (projectId?: string) => ['tasks', 'list', projectId ?? 'all'] as const,
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    subtasks: (taskId: string) => ['tasks', taskId, 'subtasks'] as const,
  },
  teams: {
    all: ['teams'] as const,
    list: (orgId?: string) => ['teams', 'list', orgId ?? 'all'] as const,
    members: (teamId: string) => ['teams', teamId, 'members'] as const,
  },
  analytics: {
    project: (projectId: string) => ['analytics', 'project', projectId] as const,
  },
};
