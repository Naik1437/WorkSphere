import React from 'react';
import { MetricCard } from '../../components/server/MetricCard';

export default function ManagerPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Sprint Velocity"
          value="38 Pts"
          change="+12%"
          trend="up"
          accentColor="blue"
        />
        <MetricCard
          label="Completion Rate"
          value="84%"
          change="+5%"
          trend="up"
          accentColor="emerald"
        />
        <MetricCard
          label="Average Cycle"
          value="3.2 Days"
          change="-0.8d"
          trend="up"
          accentColor="indigo"
        />
        <MetricCard
          label="Active Milestones"
          value="4 Targets"
          description="All checkpoints on track"
          accentColor="purple"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Manager Workflow Capabilities</h2>
        <p className="text-sm text-gray-600 mb-4">
          As a Project Manager, you have access to project milestone scheduling, task version
          control, team invitations, and automated analytics exports.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="font-semibold text-sm text-gray-900">Task Allocation</h3>
            <p className="text-xs text-gray-500 mt-1">
              Assign tasks with optimistic locking (versioning) to prevent collision overwrite.
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="font-semibold text-sm text-gray-900">Milestone Checkpoints</h3>
            <p className="text-xs text-gray-500 mt-1">
              Group deliverables into sequential targets and sync with calendar feeds.
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="font-semibold text-sm text-gray-900">Analytics Engine</h3>
            <p className="text-xs text-gray-500 mt-1">
              Real-time FastAPI metrics calculation for cycle times and status distributions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
