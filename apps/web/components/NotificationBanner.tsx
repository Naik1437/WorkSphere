'use client';

export interface NotificationBannerProps {
  notification: {
    text: string;
    type: 'info' | 'error' | 'success';
  } | null;
  onDismiss: () => void;
}

export function NotificationBanner({ notification, onDismiss }: NotificationBannerProps) {
  if (!notification) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between px-4 py-2 text-xs font-medium border-b transition-colors ${
        notification.type === 'error'
          ? 'bg-rose-950/80 border-rose-800/80 text-rose-200'
          : notification.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200'
            : 'bg-cyan-950/80 border-cyan-800/80 text-cyan-200'
      }`}
    >
      <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
        <span
          data-testid="notification-dot"
          className={`h-2 w-2 rounded-full shrink-0 ${
            notification.type === 'error'
              ? 'bg-rose-400'
              : notification.type === 'success'
                ? 'bg-emerald-400'
                : 'bg-cyan-400'
          }`}
        />
        <span className="flex-1">{notification.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-100 ml-2 p-1 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
