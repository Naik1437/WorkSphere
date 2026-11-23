import React from 'react';

export interface RoleBadgeProps {
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'AUDITOR' | string;
  size?: 'sm' | 'md';
}

/**
 * React Server Component: Role Badge rendering security clearance badges.
 * Pure presentational component requiring no client-side re-renders.
 */
export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const normalized = (role || 'MEMBER').toUpperCase();

  const colorStyles: Record<string, string> = {
    OWNER: 'bg-purple-100 text-purple-800 border-purple-200',
    ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
    MANAGER: 'bg-blue-100 text-blue-800 border-blue-200',
    MEMBER: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    AUDITOR: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const badgeClass = colorStyles[normalized] || 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-wide ${badgeClass} ${sizeStyles[size]}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {normalized}
    </span>
  );
}
