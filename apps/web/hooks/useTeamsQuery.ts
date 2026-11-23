'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

export interface TeamItem {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  memberships?: Array<{
    id: string;
    userId: string;
    role: string;
  }>;
}

export function useTeamsQuery(options?: {
  apiBaseUrl?: string;
  token?: string;
  organizationId?: string;
  enabled?: boolean;
}) {
  const apiBase = options?.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

  return useQuery({
    queryKey: queryKeys.teams.list(options?.organizationId),
    queryFn: async (): Promise<TeamItem[]> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options?.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      const res = await fetch(`${apiBase}/teams`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch teams: HTTP ${res.status}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.teams ?? [];
    },
    enabled: options?.enabled !== false && Boolean(options?.token),
    staleTime: 60 * 1000,
  });
}
