import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationBanner } from '../../components/NotificationBanner';

describe('NotificationBanner Component (A01-R10, A12-R01)', () => {
  it('does not render when notification is null', () => {
    const { container } = render(<NotificationBanner notification={null} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders info notification message and dot correctly', () => {
    render(
      <NotificationBanner
        notification={{ text: 'Welcome to WorkSphere workspace.', type: 'info' }}
        onDismiss={vi.fn()}
      />,
    );

    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Welcome to WorkSphere workspace.');

    const dot = screen.getByTestId('notification-dot');
    expect(dot).toHaveClass('bg-cyan-400');
  });

  it('renders error notification style when type is error', () => {
    render(
      <NotificationBanner
        notification={{ text: 'Failed to synchronize tasks.', type: 'error' }}
        onDismiss={vi.fn()}
      />,
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('bg-rose-950/80');
    expect(screen.getByTestId('notification-dot')).toHaveClass('bg-rose-400');
  });

  it('renders success notification style when type is success', () => {
    render(
      <NotificationBanner
        notification={{ text: 'Project created successfully.', type: 'success' }}
        onDismiss={vi.fn()}
      />,
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('bg-emerald-950/80');
    expect(screen.getByTestId('notification-dot')).toHaveClass('bg-emerald-400');
  });

  it('triggers onDismiss callback when clicking dismiss button', async () => {
    const onDismissMock = vi.fn();
    const user = userEvent.setup();

    render(
      <NotificationBanner
        notification={{ text: 'Dismissible alert', type: 'info' }}
        onDismiss={onDismissMock}
      />,
    );

    const dismissButton = screen.getByRole('button', { name: /dismiss notification/i });
    await user.click(dismissButton);

    expect(onDismissMock).toHaveBeenCalledTimes(1);
  });
});
