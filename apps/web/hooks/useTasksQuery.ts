'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  version: number;
  projectId: string;
  parentId?: string | null;
  createdAt: string;
}

export function useTasksQuery(
  projectId?: string,
  options?: {
    apiBaseUrl?: string;
    token?: string;
    enabled?: boolean;
  },
) {
  const apiBase = options?.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

  return useQuery({
    queryKey: queryKeys.tasks.list(projectId),
    queryFn: async (): Promise<TaskItem[]> => {
      if (!projectId) return [];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options?.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      const res = await fetch(`${apiBase}/projects/${projectId}/tasks`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch tasks: HTTP ${res.status}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.tasks ?? [];
    },
    enabled: Boolean(projectId) && options?.enabled !== false && Boolean(options?.token),
    staleTime: 15 * 1000, // 15 seconds fresh
  });
}
