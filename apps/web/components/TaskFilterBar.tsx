'use client';

export type FilterStatus = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface TaskFilterBarProps {
  statusFilter: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalTasksCount: number;
}

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: 'ALL', label: 'All Tasks' },
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'DONE', label: 'Done' },
];

export function TaskFilterBar({
  statusFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  totalTasksCount,
}: TaskFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
      {/* Status pills */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter tasks by status"
      >
        {filterOptions.map((opt) => {
          const isActive = statusFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFilterChange(opt.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Search & Count */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full sm:w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
        />
        <span data-testid="task-count-badge" className="text-xs text-slate-400 shrink-0 font-mono">
          {totalTasksCount} {totalTasksCount === 1 ? 'task' : 'tasks'}
        </span>
      </div>
    </div>
  );
}
