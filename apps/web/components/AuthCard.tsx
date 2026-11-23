'use client';

import { FormEvent, useState } from 'react';

export interface AuthSubmitData {
  authMode: 'login' | 'register';
  email: string;
  password: string;
  organizationName?: string;
  organizationSlug?: string;
}

export interface AuthCardProps {
  onSubmit: (data: AuthSubmitData) => void | Promise<void>;
  isSubmitting?: boolean;
  defaultMode?: 'login' | 'register';
}

export function AuthCard({ onSubmit, isSubmitting = false, defaultMode = 'login' }: AuthCardProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    if (password.length < 12) {
      setValidationError('Password must be at least 12 characters.');
      return;
    }

    if (authMode === 'register') {
      if (!orgName.trim()) {
        setValidationError('Organization name is required.');
        return;
      }
      if (!/^[a-z0-9-]{3,64}$/.test(orgSlug)) {
        setValidationError('Slug must be 3-64 lowercase alphanumeric characters and hyphens.');
        return;
      }
    }

    onSubmit({
      authMode,
      email,
      password,
      ...(authMode === 'register' ? { organizationName: orgName, organizationSlug: orgSlug } : {}),
    });
  };

  return (
    <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'login'}
          onClick={() => {
            setAuthMode('login');
            setValidationError(null);
          }}
          className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 ${
            authMode === 'login'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'register'}
          onClick={() => {
            setAuthMode('register');
            setValidationError(null);
          }}
          className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 ${
            authMode === 'register'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Create Organization
        </button>
      </div>

      {validationError && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs">
          {validationError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {authMode === 'register' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="auth-org-name">
                Organization Name
              </label>
              <input
                id="auth-org-name"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corporation"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="auth-org-slug">
                Organization Slug
              </label>
              <input
                id="auth-org-slug"
                pattern="[a-z0-9-]{3,64}"
                required
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="acme-corp"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Lowercase alphanumeric with hyphens (min 3 chars).
              </span>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="auth-email">
            Email Address
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="auth-password">
            Password (min 12 chars)
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-2 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-cyan-500/10 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? 'Processing...'
            : authMode === 'register'
              ? 'Create Enterprise Workspace'
              : 'Sign In to Workspace'}
        </button>
      </form>
    </div>
  );
}
