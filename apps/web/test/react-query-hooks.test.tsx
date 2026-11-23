import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjectsQuery } from '../hooks/useProjectsQuery';
import { useTasksQuery } from '../hooks/useTasksQuery';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('React Query Data Hooks (A01-R08)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useProjectsQuery fetches and returns project list with authorization', async () => {
    const mockProjects = [
      { id: 'proj-1', name: 'Alpha Project', organizationId: 'org-1', createdAt: '2026-11-23' },
    ];

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockProjects,
    });

    const { result } = renderHook(
      () =>
        useProjectsQuery({
          apiBaseUrl: 'http://localhost:4000/api/v1',
          token: 'test-token',
          organizationId: 'org-1',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockProjects);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('useTasksQuery fetches task list for specific project', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Task One',
        status: 'TODO',
        version: 1,
        projectId: 'proj-1',
        createdAt: '2026-11-23',
      },
    ];

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTasks,
    });

    const { result } = renderHook(
      () =>
        useTasksQuery('proj-1', {
          apiBaseUrl: 'http://localhost:4000/api/v1',
          token: 'test-token',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTasks);
  });
});
