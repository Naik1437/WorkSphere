'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdAt: string;
}

export function useProjectsQuery(options?: {
  apiBaseUrl?: string;
  token?: string;
  organizationId?: string;
  enabled?: boolean;
}) {
  const apiBase =
    options?.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

  return useQuery({
    queryKey: queryKeys.projects.list(options?.organizationId),
    queryFn: async (): Promise<ProjectItem[]> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options?.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      const res = await fetch(`${apiBase}/projects`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch projects: HTTP ${res.status}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : (data.projects ?? []);
    },
    enabled: options?.enabled !== false && Boolean(options?.token),
    staleTime: 30 * 1000, // 30 seconds fresh
  });
}
