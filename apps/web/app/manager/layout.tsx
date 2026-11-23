import React from 'react';
import { WorkspaceHeader } from '../../components/server/WorkspaceHeader';

export const metadata = {
  title: 'WorkSphere — Manager Workspace',
  description: 'Project planning, milestone tracking, and task delegation',
};

/**
 * Dedicated App Router Role Layout for Project Managers (A01-R02)
 */
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-blue-900 px-6 py-2 text-xs font-semibold text-blue-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          <span>WorkSphere Manager Console — Project Planning & Delivery</span>
        </div>
        <div className="flex items-center gap-4 text-blue-200">
          <a href="/" className="hover:text-white underline">Back to Main Workspace</a>
          <span>Role: MANAGER</span>
        </div>
      </div>
      <WorkspaceHeader
        title="Project Management & Sprints"
        subtitle="Manage project roadmaps, milestone checkpoints, team allocations, and delivery cycle times"
        breadcrumbs={['WorkSphere', 'Manager', 'Projects']}
        role="MANAGER"
      />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
