'use client';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  version: number;
  dueAt?: string | null;
  createdAt?: string;
}

export interface TaskCardProps {
  task: Task;
  onStatusChange?: (task: Task, nextStatus: TaskStatus) => void;
  onOpenActivity?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

const statusConfig: Record<TaskStatus, { label: string; badge: string; border: string }> = {
  TODO: {
    label: 'To Do',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    border: 'border-l-amber-500',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    border: 'border-l-cyan-500',
  },
  BLOCKED: {
    label: 'Blocked',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    border: 'border-l-rose-500',
  },
  DONE: {
    label: 'Done',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    border: 'border-l-emerald-500',
  },
};

export function TaskCard({ task, onStatusChange, onOpenActivity, onDelete }: TaskCardProps) {
  const currentConfig = statusConfig[task.status] || statusConfig.TODO;

  return (
    <article
      data-testid={`task-card-${task.id}`}
      className={`bg-slate-900 border border-slate-800 border-l-4 ${currentConfig.border} rounded-xl p-4 shadow-sm hover:border-slate-700 transition flex flex-col justify-between group`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition">
            {task.title}
          </h4>
          <span
            data-testid="task-version-badge"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0"
            title="Optimistic concurrency version counter"
          >
            v{task.version}
          </span>
        </div>

        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-3">{task.description}</p>
        )}
      </div>

      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-auto">
        <span
          data-testid="task-status-badge"
          className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${currentConfig.badge}`}
        >
          {currentConfig.label}
        </span>

        <div className="flex items-center gap-1">
          {onStatusChange && task.status !== 'DONE' && (
            <button
              type="button"
              onClick={() => {
                const next: TaskStatus =
                  task.status === 'TODO'
                    ? 'IN_PROGRESS'
                    : task.status === 'IN_PROGRESS'
                      ? 'DONE'
                      : 'IN_PROGRESS';
                onStatusChange(task, next);
              }}
              className="text-[10px] font-medium px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              aria-label={`Advance status for ${task.title}`}
            >
              Next Status
            </button>
          )}

          {onOpenActivity && (
            <button
              type="button"
              onClick={() => onOpenActivity(task)}
              className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition text-xs"
              aria-label={`View activity for ${task.title}`}
            >
              Activity
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition text-xs"
              aria-label={`Delete task ${task.title}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
