import React from 'react';
import { WorkspaceHeader } from '../../components/server/WorkspaceHeader';

export const metadata = {
  title: 'WorkSphere — Admin Governance',
  description: 'Organization administration and system governance',
};

/**
 * Dedicated App Router Role Layout for Administrators / Organization Owners (A01-R02)
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-purple-900 px-6 py-2 text-xs font-semibold text-purple-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>WorkSphere Administrator Console — Full Workspace Privileges (OWNER / ADMIN)</span>
        </div>
        <div className="flex items-center gap-4 text-purple-200">
          <a href="/" className="hover:text-white underline">Back to Main Workspace</a>
          <span>Role: OWNER</span>
        </div>
      </div>
      <WorkspaceHeader
        title="Organization Administration & Governance"
        subtitle="Manage organization settings, security policies, team roles, and system telemetry"
        breadcrumbs={['WorkSphere', 'Administration', 'Overview']}
        role="OWNER"
      />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
