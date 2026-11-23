import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthCard } from '../../components/AuthCard';

describe('AuthCard Component (A01-R10, A12-R01)', () => {
  it('renders login tab by default with email and password inputs', () => {
    render(<AuthCard onSubmit={vi.fn()} />);

    expect(screen.getByRole('tab', { name: /sign in/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /create organization/i })).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to workspace/i })).toBeInTheDocument();
  });

  it('switches to register tab and displays organization fields', async () => {
    const user = userEvent.setup();
    render(<AuthCard onSubmit={vi.fn()} />);

    const registerTab = screen.getByRole('tab', { name: /create organization/i });
    await user.click(registerTab);

    expect(registerTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization slug/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create enterprise workspace/i })).toBeInTheDocument();
  });

  it('validates password length under 12 characters and displays alert', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<AuthCard onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@acme.corp');
    await user.type(screen.getByLabelText(/password/i), 'shortpass');

    await user.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/password must be at least 12 characters/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates organization name and slug in register mode', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<AuthCard onSubmit={onSubmit} defaultMode="register" />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@acme.corp');
    await user.type(screen.getByLabelText(/password/i), 'SuperSecurePassword123!');
    // Leave orgName and orgSlug empty
    await user.click(screen.getByRole('button', { name: /create enterprise workspace/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/organization name is required/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid credentials and invokes onSubmit callback', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<AuthCard onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@acme.corp');
    await user.type(screen.getByLabelText(/password/i), 'SuperSecurePassword123!');

    await user.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      authMode: 'login',
      email: 'alice@acme.corp',
      password: 'SuperSecurePassword123!',
    });
  });

  it('disables submit button and displays loading state when isSubmitting is true', () => {
    render(<AuthCard onSubmit={vi.fn()} isSubmitting={true} />);

    const submitBtn = screen.getByRole('button', { name: /processing\.\.\./i });
    expect(submitBtn).toBeDisabled();
  });
});
