import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryProvider } from '../providers/QueryProvider';
import { WorkspaceHeader } from '../components/server/WorkspaceHeader';
import { MetricCard } from '../components/server/MetricCard';
import { RoleBadge } from '../components/server/RoleBadge';
import { EmptyState } from '../components/server/EmptyState';
import AdminLayout from '../app/admin/layout';
import ManagerLayout from '../app/manager/layout';
import MemberLayout from '../app/member/layout';

describe('TanStack QueryProvider (A01-R08)', () => {
  it('renders child components inside QueryClientProvider context', () => {
    render(
      <QueryProvider>
        <div data-testid="child-element">Loaded inside provider</div>
      </QueryProvider>,
    );
    expect(screen.getByTestId('child-element')).toBeInTheDocument();
    expect(screen.getByText('Loaded inside provider')).toBeInTheDocument();
  });
});

describe('React Server Components (A01-R03)', () => {
  it('WorkspaceHeader renders breadcrumbs, title, and organization metadata', () => {
    render(
      <WorkspaceHeader
        title="Engineering Operations"
        subtitle="Sprint 24 active"
        breadcrumbs={['WorkSphere', 'Acme', 'Engineering']}
        role="OWNER"
        organizationName="Acme Corp"
      />,
    );
    expect(screen.getByText('Engineering Operations')).toBeInTheDocument();
    expect(screen.getByText('Sprint 24 active')).toBeInTheDocument();
    expect(screen.getByText('Org: Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByText('WorkSphere')).toBeInTheDocument();
  });

  it('MetricCard renders label, value, and change indicators', () => {
    render(
      <MetricCard
        label="Completion Rate"
        value="94%"
        change="+6%"
        trend="up"
        description="Compared to last sprint"
        accentColor="emerald"
      />,
    );
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('+6%')).toBeInTheDocument();
    expect(screen.getByText('Compared to last sprint')).toBeInTheDocument();
  });

  it('RoleBadge renders appropriate badge color and role name', () => {
    const { rerender } = render(<RoleBadge role="MANAGER" />);
    expect(screen.getByText('MANAGER')).toBeInTheDocument();

    rerender(<RoleBadge role="AUDITOR" />);
    expect(screen.getByText('AUDITOR')).toBeInTheDocument();
  });

  it('EmptyState renders title, description, and action link', () => {
    render(
      <EmptyState
        title="No Tasks Found"
        description="Create your first task to get started."
        actionText="New Task"
        actionHref="/tasks/new"
      />,
    );
    expect(screen.getByText('No Tasks Found')).toBeInTheDocument();
    expect(screen.getByText('Create your first task to get started.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'New Task' });
    expect(link).toHaveAttribute('href', '/tasks/new');
  });
});

describe('Role-Based Layouts (A01-R02)', () => {
  it('AdminLayout renders admin console banner and children', () => {
    render(
      <AdminLayout>
        <div data-testid="admin-child">Admin Content</div>
      </AdminLayout>,
    );
    expect(screen.getByText(/WorkSphere Administrator Console/)).toBeInTheDocument();
    expect(screen.getByTestId('admin-child')).toBeInTheDocument();
  });

  it('ManagerLayout renders project manager banner and children', () => {
    render(
      <ManagerLayout>
        <div data-testid="manager-child">Manager Content</div>
      </ManagerLayout>,
    );
    expect(screen.getByText(/WorkSphere Manager Console/)).toBeInTheDocument();
    expect(screen.getByTestId('manager-child')).toBeInTheDocument();
  });

  it('MemberLayout renders team member banner and children', () => {
    render(
      <MemberLayout>
        <div data-testid="member-child">Member Content</div>
      </MemberLayout>,
    );
    expect(screen.getByText(/WorkSphere Member Console/)).toBeInTheDocument();
    expect(screen.getByTestId('member-child')).toBeInTheDocument();
  });
});
