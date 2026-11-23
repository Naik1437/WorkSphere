import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Task, TaskCard } from '../../components/TaskCard';

describe('TaskCard Component (A01-R10, A12-R01)', () => {
  const sampleTask: Task = {
    id: 'task-101',
    projectId: 'proj-1',
    title: 'Configure Vitest Test Suite',
    description: 'Set up testing library and test runner for React 19 web app',
    status: 'TODO',
    version: 3,
  };

  it('renders task title, description, and status badge', () => {
    render(<TaskCard task={sampleTask} />);

    expect(screen.getByText('Configure Vitest Test Suite')).toBeInTheDocument();
    expect(
      screen.getByText('Set up testing library and test runner for React 19 web app'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('task-status-badge')).toHaveTextContent('To Do');
  });

  it('renders optimistic concurrency version badge with version counter', () => {
    render(<TaskCard task={sampleTask} />);

    const versionBadge = screen.getByTestId('task-version-badge');
    expect(versionBadge).toHaveTextContent('v3');
  });

  it('triggers onStatusChange with next status when Next Status button is clicked', async () => {
    const onStatusChange = vi.fn();
    const user = userEvent.setup();

    render(<TaskCard task={sampleTask} onStatusChange={onStatusChange} />);

    const advanceBtn = screen.getByRole('button', { name: /advance status/i });
    await user.click(advanceBtn);

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith(sampleTask, 'IN_PROGRESS');
  });

  it('triggers onOpenActivity when activity button is clicked', async () => {
    const onOpenActivity = vi.fn();
    const user = userEvent.setup();

    render(<TaskCard task={sampleTask} onOpenActivity={onOpenActivity} />);

    const activityBtn = screen.getByRole('button', { name: /view activity/i });
    await user.click(activityBtn);

    expect(onOpenActivity).toHaveBeenCalledTimes(1);
    expect(onOpenActivity).toHaveBeenCalledWith(sampleTask);
  });

  it('triggers onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(<TaskCard task={sampleTask} onDelete={onDelete} />);

    const deleteBtn = screen.getByRole('button', { name: /delete task/i });
    await user.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(sampleTask);
  });

  it('does not render Next Status button when task status is already DONE', () => {
    const doneTask: Task = { ...sampleTask, status: 'DONE' };
    render(<TaskCard task={doneTask} onStatusChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /advance status/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('task-status-badge')).toHaveTextContent('Done');
  });
});
