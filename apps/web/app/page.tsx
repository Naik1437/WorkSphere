'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Role = 'OWNER' | 'MANAGER' | 'MEMBER' | 'AUDITOR';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
type Tab = 'board' | 'projects' | 'milestones' | 'team' | 'analytics';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  version: number;
  dueAt?: string | null;
  createdAt?: string;
}

interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueAt?: string | null;
}

interface Member {
  id: string;
  role: Role;
  user: {
    id: string;
    email: string;
  };
}

interface ActivityItem {
  id: string;
  taskId: string;
  actorId: string;
  eventType: string;
  payload: any;
  createdAt: string;
}

interface AnalyticsData {
  total_tasks: number;
  by_status: Record<string, number>;
  completion_rate: number;
  estimated_hours: number;
  average_cycle_days: number | null;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export default function Home() {
  // Authentication & Org State
  const [token, setToken] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [currentOrg, setCurrentOrg] = useState<{ id: string; name: string; slug: string } | null>(
    null,
  );
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [manualTokenInput, setManualTokenInput] = useState('');

  // UI Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('board');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('TODO');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [taskSearch, setTaskSearch] = useState('');

  // Milestones State
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newMilestoneName, setNewMilestoneName] = useState('');

  // Team & Invitations State
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

  // Analytics State
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Task Activity & Comments Modal/Drawer State
  const [activeTaskForActivity, setActiveTaskForActivity] = useState<Task | null>(null);
  const [taskActivities, setTaskActivities] = useState<ActivityItem[]>([]);
  const [newComment, setNewComment] = useState('');

  // Notifications
  const [notification, setNotification] = useState<{
    text: string;
    type: 'info' | 'error' | 'success';
  } | null>({
    text: 'Welcome to WorkSphere. Sign in or register to access your workspace.',
    type: 'info',
  });

  const showNotification = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNotification({ text, type });
  };

  // Safe API caller
  const request = async (path: string, options: RequestInit = {}, customToken?: string) => {
    const bearer = customToken ?? token;
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message ?? payload.error?.code ?? `HTTP ${response.status}`);
    }
    return payload;
  };

  // Restore saved session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('worksphere_token');
    if (savedToken) {
      setToken(savedToken);
      loadOrganizationInfo(savedToken);
      loadProjects(savedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOrganizationInfo = async (authToken = token) => {
    try {
      const payload = await request('/organizations/current', {}, authToken);
      if (payload.data) {
        setCurrentOrg(payload.data);
        setUserRole(payload.membership?.role ?? null);
      }
    } catch {
      // Organization endpoint fallback
    }
  };

  const loadProjects = async (authToken = token) => {
    try {
      const payload = await request('/projects', {}, authToken);
      const list = payload.data ?? [];
      setProjects(list);
      if (list.length > 0 && !selectedProject) {
        handleSelectProject(list[0], authToken);
      }
      return list;
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not load projects', 'error');
      return [];
    }
  };

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const body =
        authMode === 'register'
          ? { email, password, organizationName: orgName, organizationSlug: orgSlug }
          : { email, password };

      const response = await fetch(`${apiBase}/auth/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message ?? payload.error?.code ?? `HTTP ${response.status}`);
      }

      const receivedToken = payload.data.accessToken;
      setToken(receivedToken);
      localStorage.setItem('worksphere_token', receivedToken);

      showNotification('Signed in successfully! Loading workspace...', 'success');
      await loadOrganizationInfo(receivedToken);
      const loaded = await loadProjects(receivedToken);
      if (loaded.length > 0) {
        handleSelectProject(loaded[0], receivedToken);
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Authentication failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyManualToken = async () => {
    if (!manualTokenInput.trim()) return;
    const cleanToken = manualTokenInput.trim();
    setToken(cleanToken);
    localStorage.setItem('worksphere_token', cleanToken);
    showNotification('Session token applied.', 'success');
    await loadOrganizationInfo(cleanToken);
    const loaded = await loadProjects(cleanToken);
    if (loaded.length > 0) {
      handleSelectProject(loaded[0], cleanToken);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('worksphere_token');
    setCurrentOrg(null);
    setUserRole(null);
    setProjects([]);
    setSelectedProject(null);
    setTasks([]);
    setMilestones([]);
    setMembers([]);
    setAnalytics(null);
    setActiveTaskForActivity(null);
    showNotification('You have been signed out.', 'info');
  };

  const handleSelectProject = async (project: Project, authToken = token) => {
    setSelectedProject(project);
    await Promise.all([
      loadTasks(project.id, authToken),
      loadMilestones(project.id, authToken),
      loadProjectAnalytics(project.id, authToken),
    ]);
  };

  const loadTasks = async (projectId: string, authToken = token) => {
    try {
      const payload = await request(`/projects/${projectId}/tasks`, {}, authToken);
      setTasks(payload.data ?? []);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not load tasks', 'error');
    }
  };

  const loadMilestones = async (projectId: string, authToken = token) => {
    try {
      const payload = await request(`/projects/${projectId}/milestones`, {}, authToken);
      setMilestones(payload.data ?? []);
    } catch {
      setMilestones([]);
    }
  };

  const loadProjectAnalytics = async (projectId: string, authToken = token) => {
    try {
      const payload = await request(`/projects/${projectId}/analytics`, {}, authToken);
      setAnalytics(payload.data ?? null);
    } catch {
      setAnalytics(null);
    }
  };

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!newProjectName.trim()) return showNotification('Project name is required.', 'error');
    setIsSubmitting(true);
    try {
      const payload = await request('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc || undefined }),
      });
      setNewProjectName('');
      setNewProjectDesc('');
      showNotification(`Project "${payload.data.name}" created.`, 'success');
      const updated = await loadProjects();
      if (updated && updated.length > 0) {
        handleSelectProject(payload.data);
      }
      setActiveTab('board');
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Could not create project',
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to permanently delete this project?')) return;
    try {
      await request(`/projects/${projectId}`, { method: 'DELETE' });
      showNotification('Project deleted.', 'success');
      setSelectedProject(null);
      setTasks([]);
      setAnalytics(null);
      await loadProjects();
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Could not delete project',
        'error',
      );
    }
  };

  const handleCreateTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !newTaskTitle.trim()) {
      return showNotification('Select a project and enter a task title.', 'error');
    }
    setIsSubmitting(true);
    try {
      await request(`/projects/${selectedProject.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc || undefined,
          status: newTaskStatus,
        }),
      });
      setNewTaskTitle('');
      setNewTaskDesc('');
      showNotification('Task created.', 'success');
      await loadTasks(selectedProject.id);
      await loadProjectAnalytics(selectedProject.id);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not create task', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTaskStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (!selectedProject) return;
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, version: task.version }),
      });
      showNotification(`Task status updated to ${nextStatus}.`, 'success');
      await loadTasks(selectedProject.id);
      await loadProjectAnalytics(selectedProject.id);
    } catch (error: any) {
      if (error?.message?.includes('conflict') || error?.message?.includes('VERSION_CONFLICT')) {
        showNotification(
          'Task concurrency conflict: The task was modified elsewhere. Refreshed.',
          'error',
        );
        await loadTasks(selectedProject.id);
      } else {
        showNotification(error instanceof Error ? error.message : 'Could not update task', 'error');
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedProject) return;
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await request(`/tasks/${taskId}`, { method: 'DELETE' });
      showNotification('Task deleted.', 'success');
      await loadTasks(selectedProject.id);
      await loadProjectAnalytics(selectedProject.id);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not delete task', 'error');
    }
  };

  const handleCreateMilestone = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject || !newMilestoneName.trim()) return;
    setIsSubmitting(true);
    try {
      await request(`/projects/${selectedProject.id}/milestones`, {
        method: 'POST',
        body: JSON.stringify({ name: newMilestoneName }),
      });
      setNewMilestoneName('');
      showNotification('Milestone created.', 'success');
      await loadMilestones(selectedProject.id);
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Could not create milestone',
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const payload = await request('/organizations/current/members');
      setMembers(payload.data ?? []);
      showNotification(`Loaded ${(payload.data ?? []).length} team members.`, 'info');
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Could not load team members',
        'error',
      );
    }
  };

  const handleInviteMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsSubmitting(true);
    try {
      const payload = await request('/organizations/current/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail('');
      setLastInviteToken(payload.data?.invitationToken ?? null);
      showNotification('Invitation generated successfully.', 'success');
      await loadTeamMembers();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not invite member', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenActivity = async (task: Task) => {
    setActiveTaskForActivity(task);
    try {
      const payload = await request(`/tasks/${task.id}/activity`);
      setTaskActivities(payload.data ?? []);
    } catch {
      setTaskActivities([]);
    }
  };

  const handleAddComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeTaskForActivity || !newComment.trim()) return;
    try {
      await request(`/tasks/${activeTaskForActivity.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newComment }),
      });
      setNewComment('');
      showNotification('Comment added.', 'success');
      const payload = await request(`/tasks/${activeTaskForActivity.id}/activity`);
      setTaskActivities(payload.data ?? []);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Could not add comment', 'error');
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === 'ALL' ? true : task.status === statusFilter;
      const matchesQuery =
        !taskSearch.trim() ||
        task.title.toLowerCase().includes(taskSearch.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(taskSearch.toLowerCase()));
      return matchesStatus && matchesQuery;
    });
  }, [tasks, statusFilter, taskSearch]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Banner Notification */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between px-4 py-2 text-xs font-medium border-b transition-colors ${
            notification.type === 'error'
              ? 'bg-rose-950/80 border-rose-800/80 text-rose-200'
              : notification.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200'
                : 'bg-slate-900 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <span
              className={`h-2 w-2 rounded-full ${
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
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-100 ml-2"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      {!token ? (
        /* ================= AUTHENTICATION VIEW ================= */
        <div className="flex-1 flex flex-col justify-center items-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          <div className="w-full max-w-md">
            {/* Logo / Brand Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-400 shadow-lg shadow-cyan-500/20 mb-3">
                <svg
                  className="w-6 h-6 text-slate-950"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">WorkSphere</h1>
              <p className="text-xs text-slate-400 mt-1">
                Enterprise Project & Task Management Platform
              </p>
            </div>

            {/* Auth Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
              {/* Tabs */}
              <div className="flex border-b border-slate-800 mb-6">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
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
                  onClick={() => setAuthMode('register')}
                  className={`flex-1 pb-3 text-sm font-medium transition-colors border-b-2 ${
                    authMode === 'register'
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Organization
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === 'register' && (
                  <>
                    <div>
                      <label
                        className="block text-xs font-medium text-slate-300 mb-1"
                        htmlFor="auth-org-name"
                      >
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
                      <label
                        className="block text-xs font-medium text-slate-300 mb-1"
                        htmlFor="auth-org-slug"
                      >
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
                  <label
                    className="block text-xs font-medium text-slate-300 mb-1"
                    htmlFor="auth-email"
                  >
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
                  <label
                    className="block text-xs font-medium text-slate-300 mb-1"
                    htmlFor="auth-password"
                  >
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    minLength={12}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 12 characters"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold py-2.5 text-sm transition-colors shadow-md shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Authenticating...'
                    : authMode === 'login'
                      ? 'Sign In to Workspace'
                      : 'Create Organization Account'}
                </button>
              </form>

              {/* Developer token manual input fallback */}
              <div className="mt-6 pt-5 border-t border-slate-800">
                <details className="text-xs text-slate-400 group">
                  <summary className="cursor-pointer font-medium hover:text-slate-300 list-none flex items-center justify-between">
                    <span>Developer / Manual Token Sign-in</span>
                    <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    <input
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="Paste Bearer token (HMAC token)"
                      className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-xs font-mono text-slate-300 placeholder-slate-700 focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyManualToken}
                      className="w-full rounded bg-slate-800 hover:bg-slate-700 py-1.5 text-xs font-medium text-slate-200 transition"
                    >
                      Authenticate with Token
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= AUTHENTICATED WORKSPACE VIEW ================= */
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR NAVIGATION */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform transform lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:static`}
          >
            {/* Sidebar Brand Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-sky-400 flex items-center justify-center font-bold text-slate-950 text-sm shadow">
                  WS
                </div>
                <div>
                  <span className="text-sm font-bold text-white tracking-tight">WorkSphere</span>
                  <span className="block text-[10px] text-cyan-400 font-semibold tracking-wide uppercase">
                    Enterprise
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-slate-400 hover:text-white"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            </div>

            {/* Current Organization Card */}
            <div className="p-3 mx-3 my-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {currentOrg ? currentOrg.name : 'Workspace'}
                </span>
                {userRole && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 uppercase">
                    {userRole}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {currentOrg ? `@${currentOrg.slug}` : 'Default Tenant'}
              </p>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('board');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'board'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Task Board
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('projects');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'projects'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                Projects ({projects.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('milestones');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'milestones'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                  />
                </svg>
                Milestones
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('team');
                  loadTeamMembers();
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'team'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                Team & Members
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('analytics');
                  if (selectedProject) loadProjectAnalytics(selectedProject.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Analytics Engine
              </button>
            </nav>

            {/* Active Project Switcher in Sidebar */}
            <div className="p-3 border-t border-slate-800">
              <label
                htmlFor="sidebar-project-select"
                className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
              >
                Active Project
              </label>
              <select
                id="sidebar-project-select"
                value={selectedProject?.id ?? ''}
                onChange={(e) => {
                  const p = projects.find((item) => item.id === e.target.value);
                  if (p) handleSelectProject(p);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {projects.length === 0 && <option value="">No projects</option>}
              </select>
            </div>

            {/* Footer / Sign Out */}
            <div className="p-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                {currentOrg ? currentOrg.name : 'WorkSphere User'}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-medium text-rose-400 hover:text-rose-300 py-1 px-2 rounded hover:bg-rose-950/30 transition"
              >
                Sign out
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto">
            {/* Top Workspace Bar */}
            <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md"
                  aria-label="Open sidebar"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-medium">WorkSphere</span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-300 font-medium">
                    {currentOrg ? currentOrg.name : 'Org'}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-cyan-400 font-semibold">
                    {selectedProject ? selectedProject.name : 'Select Project'}
                  </span>
                </div>
              </div>

              {/* Status / Quick info */}
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  API Connected
                </span>
              </div>
            </header>

            {/* TAB CONTENT VIEWS */}
            <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
              {/* ================= 1. TASK BOARD TAB ================= */}
              {activeTab === 'board' && (
                <div className="space-y-6">
                  {/* Project Summary Banner */}
                  {selectedProject ? (
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">
                          {selectedProject.name}
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                          {selectedProject.description ||
                            'No description provided for this project.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
                          {tasks.length} total tasks
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedProject) {
                              loadTasks(selectedProject.id);
                              loadProjectAnalytics(selectedProject.id);
                              showNotification('Tasks refreshed.', 'info');
                            }
                          }}
                          className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1.5 rounded-lg transition"
                        >
                          Refresh Board
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8 text-center">
                      <p className="text-sm font-semibold text-slate-300">No project selected</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Select a project from the sidebar or create one in the Projects tab to
                        begin.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('projects')}
                        className="mt-4 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition"
                      >
                        Go to Projects
                      </button>
                    </div>
                  )}

                  {selectedProject && (
                    <>
                      {/* Create Task Card */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                          Create New Task
                        </h2>
                        <form
                          onSubmit={handleCreateTask}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-3"
                        >
                          <div className="sm:col-span-5">
                            <label htmlFor="task-title" className="sr-only">
                              Task Title
                            </label>
                            <input
                              id="task-title"
                              required
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              placeholder="What needs to be done?"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <label htmlFor="task-desc" className="sr-only">
                              Description
                            </label>
                            <input
                              id="task-desc"
                              value={newTaskDesc}
                              onChange={(e) => setNewTaskDesc(e.target.value)}
                              placeholder="Additional details (optional)"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label htmlFor="task-initial-status" className="sr-only">
                              Status
                            </label>
                            <select
                              id="task-initial-status"
                              value={newTaskStatus}
                              onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-300"
                            >
                              <option value="TODO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="BLOCKED">Blocked</option>
                              <option value="DONE">Done</option>
                            </select>
                          </div>
                          <div className="sm:col-span-1">
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="w-full h-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs py-2 transition disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Filters & Search Toolbar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                        {/* Status Filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                          {(['ALL', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const).map(
                            (filter) => (
                              <button
                                key={filter}
                                type="button"
                                onClick={() => setStatusFilter(filter)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                                  statusFilter === filter
                                    ? 'bg-cyan-500 text-slate-950 font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                {filter === 'ALL'
                                  ? `All (${tasks.length})`
                                  : `${statusConfig[filter].label} (${tasks.filter((t) => t.status === filter).length})`}
                              </button>
                            ),
                          )}
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                          <input
                            value={taskSearch}
                            onChange={(e) => setTaskSearch(e.target.value)}
                            placeholder="Filter tasks..."
                            className="w-full sm:w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                          />
                          {taskSearch && (
                            <button
                              type="button"
                              onClick={() => setTaskSearch('')}
                              className="absolute right-2 top-1.5 text-xs text-slate-500 hover:text-slate-300"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tasks List / Grid */}
                      <div className="grid gap-3">
                        {filteredTasks.map((t) => (
                          <div
                            key={t.id}
                            className={`rounded-xl border border-slate-800/80 bg-slate-900/70 p-4 transition hover:border-slate-700 border-l-4 ${statusConfig[t.status].border}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-semibold text-slate-100">
                                    {t.title}
                                  </h3>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusConfig[t.status].badge}`}
                                  >
                                    {statusConfig[t.status].label}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    v{t.version}
                                  </span>
                                </div>
                                {t.description && (
                                  <p className="text-xs text-slate-400 mt-1">{t.description}</p>
                                )}
                              </div>

                              {/* Action Controls */}
                              <div className="flex items-center gap-2 self-end sm:self-center">
                                {/* Status select */}
                                <select
                                  aria-label="Change status"
                                  value={t.status}
                                  onChange={(e) =>
                                    handleUpdateTaskStatus(t, e.target.value as TaskStatus)
                                  }
                                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                                >
                                  <option value="TODO">To Do</option>
                                  <option value="IN_PROGRESS">In Progress</option>
                                  <option value="BLOCKED">Blocked</option>
                                  <option value="DONE">Done</option>
                                </select>

                                {/* Activity / Comments Drawer trigger */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenActivity(t)}
                                  className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700 transition"
                                >
                                  Comments / Log
                                </button>

                                {/* Delete */}
                                {userRole !== 'AUDITOR' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(t.id)}
                                    className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition"
                                    title="Delete task"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {filteredTasks.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
                            <p className="text-xs font-medium text-slate-400">No tasks found</p>
                            <p className="text-[11px] text-slate-600 mt-1">
                              {taskSearch
                                ? 'No tasks matched your search query.'
                                : 'Create your first task using the form above.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ================= 2. PROJECTS TAB ================= */}
              {activeTab === 'projects' && (
                <div className="space-y-6">
                  {/* Header & Create Project Card */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Organization Projects
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Create and organize distinct project workspaces for your teams and workflows.
                    </p>

                    <form
                      onSubmit={handleCreateProject}
                      className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-3"
                    >
                      <div className="sm:col-span-5">
                        <label htmlFor="create-project-name" className="sr-only">
                          Project Name
                        </label>
                        <input
                          id="create-project-name"
                          required
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          placeholder="Project title (e.g. Core Infrastructure)"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <label htmlFor="create-project-desc" className="sr-only">
                          Description
                        </label>
                        <input
                          id="create-project-desc"
                          value={newProjectDesc}
                          onChange={(e) => setNewProjectDesc(e.target.value)}
                          placeholder="Optional project description"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full h-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs py-2 transition disabled:opacity-50"
                        >
                          + Create Project
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Projects Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((p) => {
                      const isSelected = selectedProject?.id === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`rounded-2xl border p-5 flex flex-col justify-between transition ${
                            isSelected
                              ? 'border-cyan-500/50 bg-cyan-950/10 shadow-lg shadow-cyan-950/30'
                              : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 uppercase">
                                Project
                              </span>
                              {userRole === 'OWNER' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProject(p.id)}
                                  className="text-xs text-rose-400 hover:text-rose-300"
                                  title="Delete Project"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <h3 className="text-base font-bold text-white">{p.name}</h3>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {p.description || 'No description provided.'}
                            </p>
                          </div>

                          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">
                              {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Active'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectProject(p);
                                setActiveTab('board');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                isSelected
                                  ? 'bg-cyan-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              }`}
                            >
                              {isSelected ? 'Active Workspace' : 'Open Workspace'}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {projects.length === 0 && (
                      <div className="col-span-full rounded-2xl border border-dashed border-slate-800 p-10 text-center">
                        <p className="text-xs text-slate-400">
                          No projects yet in this organization.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================= 3. MILESTONES TAB ================= */}
              {activeTab === 'milestones' && (
                <div className="space-y-6">
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Project Milestones {selectedProject && `— ${selectedProject.name}`}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Set high-level target checkpoints and deliverables for this project.
                    </p>

                    {selectedProject ? (
                      <form onSubmit={handleCreateMilestone} className="mt-5 flex gap-3 max-w-md">
                        <label htmlFor="create-milestone-name" className="sr-only">
                          Milestone Name
                        </label>
                        <input
                          id="create-milestone-name"
                          required
                          value={newMilestoneName}
                          onChange={(e) => setNewMilestoneName(e.target.value)}
                          placeholder="e.g. Beta Release or Audit Pass"
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs px-4 py-2 transition disabled:opacity-50"
                        >
                          + Add Milestone
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-amber-400 mt-3">
                        Please select a project first to view milestones.
                      </p>
                    )}
                  </div>

                  {/* Milestones Timeline */}
                  <div className="grid gap-3">
                    {milestones.map((m, index) => (
                      <div
                        key={m.id}
                        className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-400">
                            {index + 1}
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white">{m.name}</h4>
                            <p className="text-[11px] text-slate-500">
                              Target Date:{' '}
                              {m.dueAt ? new Date(m.dueAt).toLocaleDateString() : 'Continuous'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          Active Checkpoint
                        </span>
                      </div>
                    ))}

                    {milestones.length === 0 && selectedProject && (
                      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                        <p className="text-xs text-slate-500">
                          No milestones recorded yet for this project.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================= 4. TEAM & MEMBERS TAB ================= */}
              {activeTab === 'team' && (
                <div className="space-y-6">
                  {/* Invitation Section */}
                  {['OWNER', 'MANAGER'].includes(userRole ?? '') && (
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        Invite Team Member
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Send an invitation token to a teammate to join this organization workspace.
                      </p>

                      <form
                        onSubmit={handleInviteMember}
                        className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 max-w-xl"
                      >
                        <div className="sm:col-span-7">
                          <label htmlFor="invite-member-email" className="sr-only">
                            Email Address
                          </label>
                          <input
                            id="invite-member-email"
                            type="email"
                            required
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label htmlFor="invite-member-role" className="sr-only">
                            Role
                          </label>
                          <select
                            id="invite-member-role"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as Role)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="MANAGER">Manager</option>
                            <option value="AUDITOR">Auditor</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs py-2 transition disabled:opacity-50"
                          >
                            Invite
                          </button>
                        </div>
                      </form>

                      {lastInviteToken && (
                        <div className="mt-4 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
                          <span className="text-xs font-bold text-cyan-300 block mb-1">
                            Invitation Token Generated:
                          </span>
                          <p className="text-[11px] font-mono break-all text-slate-300 select-all">
                            {lastInviteToken}
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Share this token with the invited member to complete their onboarding.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Members Roster */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-white">Active Members</h3>
                        <p className="text-xs text-slate-400">
                          Current users assigned to this workspace
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadTeamMembers}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        Refresh Roster
                      </button>
                    </div>

                    <div className="divide-y divide-slate-800/80">
                      {members.map((m) => (
                        <div key={m.id} className="py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                              {m.user.email.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">{m.user.email}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                ID: {m.user.id.slice(0, 8)}...
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 uppercase tracking-wider border border-slate-700">
                            {m.role}
                          </span>
                        </div>
                      ))}

                      {members.length === 0 && (
                        <p className="py-4 text-center text-xs text-slate-500">
                          Click &quot;Refresh Roster&quot; above to load members.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ================= 5. ANALYTICS TAB ================= */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        FastAPI Project Analytics {selectedProject && `— ${selectedProject.name}`}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Real-time workload metrics, completion rates, and cycle-time velocity.
                      </p>
                    </div>
                    {selectedProject && (
                      <button
                        type="button"
                        onClick={() => {
                          loadProjectAnalytics(selectedProject.id);
                          showNotification('Analytics recalculated.', 'info');
                        }}
                        className="text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1.5 rounded-lg hover:bg-cyan-950/60 transition"
                      >
                        Recalculate Metrics
                      </button>
                    )}
                  </div>

                  {analytics ? (
                    <>
                      {/* Metric KPI Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                          <span className="text-xs font-medium text-slate-400">Total Workload</span>
                          <p className="text-2xl font-black text-white mt-2">
                            {analytics.total_tasks}
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Tracked project items
                          </span>
                        </div>

                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                          <span className="text-xs font-medium text-slate-400">
                            Completion Rate
                          </span>
                          <p className="text-2xl font-black text-emerald-400 mt-2">
                            {Math.round(analytics.completion_rate * 100)}%
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Completed vs total
                          </span>
                        </div>

                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                          <span className="text-xs font-medium text-slate-400">
                            Estimated Effort
                          </span>
                          <p className="text-2xl font-black text-cyan-300 mt-2">
                            {analytics.estimated_hours}h
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Hours remaining
                          </span>
                        </div>

                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                          <span className="text-xs font-medium text-slate-400">Avg Cycle Time</span>
                          <p className="text-2xl font-black text-amber-300 mt-2">
                            {analytics.average_cycle_days !== null
                              ? `${analytics.average_cycle_days}d`
                              : 'N/A'}
                          </p>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Days from creation to done
                          </span>
                        </div>
                      </div>

                      {/* Visual Completion Progress Bar */}
                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Overall Milestone Velocity
                          </span>
                          <span className="text-xs font-bold text-cyan-400">
                            {Math.round(analytics.completion_rate * 100)}% Complete
                          </span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700"
                            style={{ width: `${Math.round(analytics.completion_rate * 100)}%` }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-10 text-center">
                      <p className="text-xs text-slate-400">
                        {selectedProject
                          ? 'No analytics available. Add tasks to see real-time metrics.'
                          : 'Select a project to view metrics.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* ================= TASK ACTIVITY & COMMENTS MODAL/DRAWER ================= */}
          {activeTaskForActivity && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white truncate max-w-xs">
                      {activeTaskForActivity.title}
                    </h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Task Audit & Comments Log
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTaskForActivity(null)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* Activity List */}
                <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
                  {taskActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-cyan-400 uppercase font-bold">
                          {act.eventType}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(act.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      {act.payload?.comment && (
                        <p className="text-slate-200 mt-1">{act.payload.comment}</p>
                      )}
                      {act.payload?.previousStatus && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Status changed: {act.payload.previousStatus} → {act.payload.newStatus}
                        </p>
                      )}
                    </div>
                  ))}

                  {taskActivities.length === 0 && (
                    <p className="text-center py-6 text-xs text-slate-500">
                      No activity or comments recorded yet for this task.
                    </p>
                  )}
                </div>

                {/* Add Comment Form */}
                <form
                  onSubmit={handleAddComment}
                  className="pt-3 border-t border-slate-800 flex gap-2"
                >
                  <label htmlFor="modal-comment-input" className="sr-only">
                    Comment
                  </label>
                  <input
                    id="modal-comment-input"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs px-4 py-2 transition"
                  >
                    Post
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
