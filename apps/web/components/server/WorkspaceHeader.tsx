import React from 'react';

export interface WorkspaceHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  role?: string;
  organizationName?: string;
}

/**
 * React Server Component: Presentation header with breadcrumbs and tenant metadata.
 * Has no client-side state or hooks, rendering entirely on the server.
 */
export function WorkspaceHeader({
  title,
  subtitle,
  breadcrumbs = ['WorkSphere'],
  role,
  organizationName,
}: WorkspaceHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav
            aria-label="Breadcrumbs"
            className="mb-1 flex items-center gap-1.5 text-xs text-gray-500"
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb}>
                {idx > 0 && <span className="text-gray-400">/</span>}
                <span className={idx === breadcrumbs.length - 1 ? 'font-medium text-gray-800' : ''}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>

        <div className="mt-2 flex items-center gap-3 sm:mt-0">
          {organizationName && (
            <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Org: {organizationName}
            </span>
          )}
          {role && (
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                role === 'OWNER'
                  ? 'bg-purple-100 text-purple-800'
                  : role === 'MANAGER'
                    ? 'bg-blue-100 text-blue-800'
                    : role === 'AUDITOR'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {role}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
