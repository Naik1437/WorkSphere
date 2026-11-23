import React from 'react';
import { WorkspaceHeader } from '../../components/server/WorkspaceHeader';

export const metadata = {
  title: 'WorkSphere — Member Workspace',
  description: 'Team task board, comments, and collaborative execution',
};

/**
 * Dedicated App Router Role Layout for Team Members (A01-R02)
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-emerald-900 px-6 py-2 text-xs font-semibold text-emerald-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>WorkSphere Member Console — Collaborative Execution</span>
        </div>
        <div className="flex items-center gap-4 text-emerald-200">
          <a href="/" className="hover:text-white underline">Back to Main Workspace</a>
          <span>Role: MEMBER</span>
        </div>
      </div>
      <WorkspaceHeader
        title="Member Focus & Execution"
        subtitle="Collaborate on assigned tasks, discuss updates in activity threads, and track personal deliverables"
        breadcrumbs={['WorkSphere', 'Member', 'Focus']}
        role="MEMBER"
      />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
