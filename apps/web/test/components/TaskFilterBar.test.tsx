import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskFilterBar } from '../../components/TaskFilterBar';

describe('TaskFilterBar Component (A01-R10, A12-R01)', () => {
  it('renders all status filter pills and total task count', () => {
    render(
      <TaskFilterBar
        statusFilter="ALL"
        onFilterChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        totalTasksCount={12}
      />,
    );

    expect(screen.getByRole('button', { name: /all tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /to do/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /in progress/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /blocked/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();

    expect(screen.getByTestId('task-count-badge')).toHaveTextContent('12 tasks');
  });

  it('highlights the active filter button with aria-pressed=true', () => {
    render(
      <TaskFilterBar
        statusFilter="IN_PROGRESS"
        onFilterChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        totalTasksCount={5}
      />,
    );

    const inProgressBtn = screen.getByRole('button', { name: /in progress/i });
    expect(inProgressBtn).toHaveAttribute('aria-pressed', 'true');

    const allBtn = screen.getByRole('button', { name: /all tasks/i });
    expect(allBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('triggers onFilterChange when a filter pill is clicked', async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskFilterBar
        statusFilter="ALL"
        onFilterChange={onFilterChange}
        searchQuery=""
        onSearchChange={vi.fn()}
        totalTasksCount={10}
      />,
    );

    await user.click(screen.getByRole('button', { name: /blocked/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('BLOCKED');
  });

  it('calls onSearchChange when user types in search input', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskFilterBar
        statusFilter="ALL"
        onFilterChange={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
        totalTasksCount={1}
      />,
    );

    const searchInput = screen.getByRole('searchbox', { name: /search tasks/i });
    await user.type(searchInput, 'vitest');

    expect(onSearchChange).toHaveBeenCalled();
  });

  it('formats singular task count properly', () => {
    render(
      <TaskFilterBar
        statusFilter="ALL"
        onFilterChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        totalTasksCount={1}
      />,
    );

    expect(screen.getByTestId('task-count-badge')).toHaveTextContent('1 task');
  });
});
