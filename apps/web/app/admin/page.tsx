import React from 'react';
import { MetricCard } from '../../components/server/MetricCard';
import { RoleBadge } from '../../components/server/RoleBadge';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Active Organization"
          value="WorkSphere Primary"
          description="Tenant Isolation Level: Strict"
          accentColor="purple"
        />
        <MetricCard
          label="Assigned Role"
          value="OWNER"
          description="Full Administrative Access"
          accentColor="emerald"
        />
        <MetricCard
          label="Audit Logging"
          value="Enabled"
          description="RFC 5424 structured logging"
          accentColor="blue"
        />
        <MetricCard
          label="Security Baseline"
          value="Verified"
          description="A12-R06 Pen Tested"
          accentColor="indigo"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Role Privileges & Governance Matrix
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Scope</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Project CRUD</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Invitations</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Delete Perms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3">
                  <RoleBadge role="OWNER" />
                </td>
                <td className="px-4 py-3 text-gray-600">Full Organization</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">
                  Create, Read, Update, Delete
                </td>
                <td className="px-4 py-3 text-emerald-600 font-medium">Manage & Revoke</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">All Entities</td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <RoleBadge role="MANAGER" />
                </td>
                <td className="px-4 py-3 text-gray-600">Assigned Projects</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">Create, Read, Update</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">Invite Members</td>
                <td className="px-4 py-3 text-amber-600 font-medium">Tasks Only</td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <RoleBadge role="MEMBER" />
                </td>
                <td className="px-4 py-3 text-gray-600">Project Tasks</td>
                <td className="px-4 py-3 text-blue-600 font-medium">Read Only</td>
                <td className="px-4 py-3 text-gray-400">None</td>
                <td className="px-4 py-3 text-gray-400">None</td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <RoleBadge role="AUDITOR" />
                </td>
                <td className="px-4 py-3 text-gray-600">Read-Only Logs</td>
                <td className="px-4 py-3 text-gray-500 font-medium">Read Only</td>
                <td className="px-4 py-3 text-gray-400">None</td>
                <td className="px-4 py-3 text-gray-400">None</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
