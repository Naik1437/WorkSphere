import React from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'purple' | 'blue';
}

/**
 * React Server Component: Metric card for analytics dashboards and progress overviews.
 * Fully static presentation rendered without client JavaScript bundle overhead.
 */
export function MetricCard({
  label,
  value,
  change,
  trend = 'neutral',
  description,
  accentColor = 'indigo',
}: MetricCardProps) {
  const accentClasses = {
    indigo: 'border-l-indigo-500 text-indigo-600',
    emerald: 'border-l-emerald-500 text-emerald-600',
    amber: 'border-l-amber-500 text-amber-600',
    purple: 'border-l-purple-500 text-purple-600',
    blue: 'border-l-blue-500 text-blue-600',
  };

  const trendColors = {
    up: 'text-emerald-600 bg-emerald-50',
    down: 'text-red-600 bg-red-50',
    neutral: 'text-gray-600 bg-gray-50',
  };

  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 bg-white p-5 shadow-sm ${accentClasses[accentColor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {change && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${trendColors[trend]}`}>
            {change}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</div>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
    </div>
  );
}
