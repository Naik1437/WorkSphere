import React from 'react';
import Link from 'next/link';
import { MetricCard } from '../../components/server/MetricCard';

export default function MemberPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="My In-Progress Tasks"
          value="3 Tasks"
          description="Priority: High"
          accentColor="emerald"
        />
        <MetricCard
          label="Pending Discussions"
          value="2 Threads"
          description="Active team comments"
          accentColor="blue"
        />
        <MetricCard
          label="Upcoming Due Dates"
          value="Tomorrow"
          description="Milestone sprint wrap"
          accentColor="amber"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Member Collaboration Tools</h2>
        <p className="text-sm text-gray-600 mb-4">
          Team members have permission to update task statuses, create subtasks, append comments to
          activity threads, and stream real-time task updates via Server-Sent Events.
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Open Interactive Task Board
          </Link>
        </div>
      </div>
    </div>
  );
}
