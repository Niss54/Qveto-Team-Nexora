'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from '@/components/RoleBadge';
import { CreateOrgModal } from '@/components/CreateOrgModal';
import { api, ApiClientError } from '@/lib/api-client';
import type { OrgMemberResponse } from '@qveto/shared';

type TabType = 'my-work' | 'analytics' | 'organization';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface MyWorkTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  projectId: string;
  assigneeId: string | null;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    workspace: {
      id: string;
      name: string;
      orgId: string;
    };
  };
}

interface MyWorkResponse {
  data: MyWorkTask[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  summary: {
    totalOpen: number;
    overdue: number;
    dueToday: number;
    completed: number;
  };
}

interface AnalyticsData {
  orgId: string;
  projectId: string | null;
  overview: {
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
    overdueTasks: number;
    completionRate: number;
    onTimeCompletionRate: number;
    assignmentCoverage: number;
    assignedTasks: number;
    unassignedTasks: number;
  };
  statusDistribution: Record<TaskStatus, number>;
  priorityDistribution: Record<TaskPriority, number>;
  projectProgress: Array<{
    id: string;
    name: string;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    progressPercentage: number;
  }>;
  workloadByAssignee: Array<{
    userId: string | null;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    totalTasks: number;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
  }>;
}

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'DONE', label: 'Done' },
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const priorityStyles: Record<TaskPriority, { badge: string; text: string }> = {
  LOW: { badge: 'bg-slate-100 text-slate-700 border-slate-200', text: 'Low' },
  MEDIUM: { badge: 'bg-blue-50 text-blue-700 border-blue-200', text: 'Medium' },
  HIGH: { badge: 'bg-amber-50 text-amber-700 border-amber-200', text: 'High' },
  URGENT: { badge: 'bg-rose-50 text-rose-700 border-rose-200', text: 'Urgent' },
};

const statusStyles: Record<TaskStatus, { badge: string; text: string }> = {
  TODO: { badge: 'bg-gray-100 text-gray-700 border-gray-200', text: 'To Do' },
  IN_PROGRESS: { badge: 'bg-blue-100 text-blue-700 border-blue-200', text: 'In Progress' },
  IN_REVIEW: { badge: 'bg-purple-100 text-purple-700 border-purple-200', text: 'In Review' },
  DONE: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', text: 'Done' },
};

function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'DONE') return false;
  return new Date(dueDate) < new Date();
}

function isDueToday(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'DONE') return false;
  const due = new Date(dueDate);
  const now = new Date();
  return (
    due.getUTCFullYear() === now.getUTCFullYear() &&
    due.getUTCMonth() === now.getUTCMonth() &&
    due.getUTCDate() === now.getUTCDate()
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('my-work');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);

  // -------------------------------------------------------------
  // Tab 1: My Work State
  // -------------------------------------------------------------
  const [myWorkData, setMyWorkData] = useState<MyWorkResponse | null>(null);
  const [loadingMyWork, setLoadingMyWork] = useState(false);
  const [myWorkError, setMyWorkError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [overdueFilter, setOverdueFilter] = useState<boolean>(false);
  const [myWorkPage, setMyWorkPage] = useState<number>(1);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);

  // -------------------------------------------------------------
  // Tab 2: Productivity Analytics State
  // -------------------------------------------------------------
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsProjectFilter, setAnalyticsProjectFilter] = useState<string>('');

  // -------------------------------------------------------------
  // Tab 3: Organization & Members State
  // -------------------------------------------------------------
  const [members, setMembers] = useState<OrgMemberResponse[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'EMPLOYEE' | 'MANAGER' | 'OWNER'>('EMPLOYEE');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  // Route protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // -------------------------------------------------------------
  // Fetch Functions
  // -------------------------------------------------------------

  const fetchMyWork = useCallback(async () => {
    if (!currentOrg) {
      setMyWorkData(null);
      return;
    }
    setLoadingMyWork(true);
    setMyWorkError(null);
    try {
      const params = new URLSearchParams();
      params.set('orgId', currentOrg.id);
      params.set('page', myWorkPage.toString());
      params.set('pageSize', '15');
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (projectFilter.trim()) params.set('projectId', projectFilter.trim());
      if (overdueFilter) params.set('overdue', 'true');

      const res = await api.get<MyWorkResponse>(`/api/tasks/my-work?${params.toString()}`);
      setMyWorkData(res);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setMyWorkError(err.error.message || 'Failed to load My Work');
      } else {
        setMyWorkError('An unexpected error occurred while loading your tasks.');
      }
    } finally {
      setLoadingMyWork(false);
    }
  }, [currentOrg, myWorkPage, statusFilter, priorityFilter, projectFilter, overdueFilter]);

  const fetchAnalytics = useCallback(async () => {
    if (!currentOrg) {
      setAnalyticsData(null);
      return;
    }
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const params = new URLSearchParams();
      params.set('orgId', currentOrg.id);
      if (analyticsProjectFilter.trim()) {
        params.set('projectId', analyticsProjectFilter.trim());
      }
      const res = await api.get<{ analytics: AnalyticsData }>(
        `/api/analytics/productivity?${params.toString()}`,
      );
      setAnalyticsData(res.analytics);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setAnalyticsError(err.error.message || 'Failed to load Productivity Analytics');
      } else {
        setAnalyticsError('An unexpected error occurred while loading analytics.');
      }
    } finally {
      setLoadingAnalytics(false);
    }
  }, [currentOrg, analyticsProjectFilter]);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const res = await api.get<{ members: OrgMemberResponse[] }>(
        `/api/organizations/${currentOrg.id}/members`,
      );
      setMembers(res.members);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [currentOrg]);

  // Initial and reactive fetches
  useEffect(() => {
    if (currentOrg) {
      fetchMyWork();
    }
  }, [currentOrg, fetchMyWork]);

  useEffect(() => {
    if (currentOrg && activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [currentOrg, activeTab, fetchAnalytics]);

  useEffect(() => {
    if (currentOrg && activeTab === 'organization') {
      fetchMembers();
    }
  }, [currentOrg, activeTab, fetchMembers]);

  // Quick Task Status Update Handler
  const handleUpdateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingTaskId(taskId);
    setTaskNotice(null);
    try {
      await api.patch<{ task: unknown }>(`/api/tasks/${taskId}`, { status: newStatus });
      setTaskNotice(`Task updated to ${statusStyles[newStatus].text}`);
      // Refetch My Work and Analytics in parallel to update all counters
      await Promise.all([fetchMyWork(), fetchAnalytics()]);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setTaskNotice(err.error.message || 'Failed to update task');
      } else {
        setTaskNotice('Failed to update task status');
      }
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Add Member Handler (OWNER only)
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !newMemberEmail.trim()) return;

    setAddingMember(true);
    setMemberError(null);
    setMemberSuccess(null);

    try {
      await api.post(`/api/organizations/${currentOrg.id}/members`, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
      setMemberSuccess(`Successfully added ${newMemberEmail} as ${newMemberRole}.`);
      setNewMemberEmail('');
      await fetchMembers();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setMemberError(err.error.message || 'Failed to add member.');
      } else {
        setMemberError('An error occurred.');
      }
    } finally {
      setAddingMember(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
    setProjectFilter('');
    setOverdueFilter(false);
    setMyWorkPage(1);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading platform...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary-900 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-200">
            Platform Dashboard
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Welcome back, {user.name}! 👋
          </h1>
          <p className="text-primary-100 text-sm mt-2">
            Centralized productivity dashboard. Track your assigned tasks, monitor team completion rates, and manage workspace permissions.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {currentOrg ? (
              <>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-lg border border-white/20 text-sm">
                  <span>🏢 Active Org:</span>
                  <span className="font-semibold">{currentOrg.name}</span>
                </div>
                {currentOrg.role && <RoleBadge role={currentOrg.role} />}
              </>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className="btn-primary text-xs bg-white text-primary-900 hover:bg-gray-100 font-semibold"
              >
                + Create Your First Organization
              </button>
            )}
          </div>
        </div>
      </div>

      {!currentOrg ? (
        /* Empty State when no Organization is Selected */
        <div className="card text-center py-16 px-4">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
            🏢
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Organization Selected</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-2">
            You don&apos;t have an active organization selected. Select or create an organization to view your personal tasks and analytics.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-6 btn-primary text-sm inline-flex items-center gap-2"
          >
            + Create New Organization
          </button>
        </div>
      ) : (
        <>
          {/* Dashboard Tab Navigation Bar */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-2 sm:space-x-6" aria-label="Dashboard Tabs">
              <button
                role="tab"
                aria-selected={activeTab === 'my-work'}
                onClick={() => setActiveTab('my-work')}
                className={`pb-3 px-2 sm:px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'my-work'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>📋</span>
                <span>My Work</span>
                {myWorkData?.summary?.totalOpen !== undefined && myWorkData.summary.totalOpen > 0 && (
                  <span className="ml-1 bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-bold">
                    {myWorkData.summary.totalOpen}
                  </span>
                )}
              </button>

              <button
                role="tab"
                aria-selected={activeTab === 'analytics'}
                onClick={() => setActiveTab('analytics')}
                className={`pb-3 px-2 sm:px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'analytics'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>📊</span>
                <span>Productivity Analytics</span>
              </button>

              <button
                role="tab"
                aria-selected={activeTab === 'organization'}
                onClick={() => setActiveTab('organization')}
                className={`pb-3 px-2 sm:px-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'organization'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>🏢</span>
                <span>Organization & Members</span>
              </button>
            </nav>
          </div>

          {/* Feedback Notice Toast */}
          {taskNotice && (
            <div className="p-3 text-sm bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 flex items-center justify-between animate-in fade-in">
              <span>{taskNotice}</span>
              <button
                onClick={() => setTaskNotice(null)}
                className="text-xs text-emerald-600 hover:text-emerald-900 font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 1: MY WORK */}
          {/* ========================================================= */}
          {activeTab === 'my-work' && (
            <div className="space-y-6">
              {/* Four KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-5 border-l-4 border-l-indigo-500">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Total Open
                    </span>
                    <span className="p-2 bg-indigo-50 rounded-lg text-indigo-600 text-sm">📋</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {loadingMyWork && !myWorkData ? '—' : myWorkData?.summary.totalOpen ?? 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Active tasks assigned to you</p>
                </div>

                <div className="card p-5 border-l-4 border-l-rose-500">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Overdue
                    </span>
                    <span className="p-2 bg-rose-50 rounded-lg text-rose-600 text-sm">⚠️</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-gray-900">
                      {loadingMyWork && !myWorkData ? '—' : myWorkData?.summary.overdue ?? 0}
                    </p>
                    {myWorkData && myWorkData.summary.overdue > 0 && (
                      <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                        Requires action
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Past scheduled due date</p>
                </div>

                <div className="card p-5 border-l-4 border-l-amber-500">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Due Today
                    </span>
                    <span className="p-2 bg-amber-50 rounded-lg text-amber-600 text-sm">⏰</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {loadingMyWork && !myWorkData ? '—' : myWorkData?.summary.dueToday ?? 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Scheduled for today</p>
                </div>

                <div className="card p-5 border-l-4 border-l-emerald-500">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Completed
                    </span>
                    <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600 text-sm">✅</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {loadingMyWork && !myWorkData ? '—' : myWorkData?.summary.completed ?? 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Finished tasks</p>
                </div>
              </div>

              {/* Filters Card */}
              <div className="card p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>🔍</span> Filter Assigned Tasks
                  </h3>
                  {(statusFilter || priorityFilter || projectFilter || overdueFilter) && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-primary-600 hover:text-primary-800 font-semibold self-start sm:self-auto"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                  {/* Status Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setMyWorkPage(1);
                      }}
                      className="input-field text-xs py-2 w-full"
                    >
                      <option value="">All Statuses</option>
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Priority</label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => {
                        setPriorityFilter(e.target.value);
                        setMyWorkPage(1);
                      }}
                      className="input-field text-xs py-2 w-full"
                    >
                      <option value="">All Priorities</option>
                      {priorityOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Project ID Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Project ID</label>
                    <input
                      type="text"
                      value={projectFilter}
                      onChange={(e) => {
                        setProjectFilter(e.target.value);
                        setMyWorkPage(1);
                      }}
                      placeholder="Filter by project ID"
                      className="input-field text-xs py-2 w-full"
                    />
                  </div>

                  {/* Overdue Checkbox */}
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overdueFilter}
                        onChange={(e) => {
                          setOverdueFilter(e.target.checked);
                          setMyWorkPage(1);
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                      />
                      <span>Show Overdue Only ⚠️</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* My Work Task List */}
              <div className="card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900">
                    Assigned Tasks ({myWorkData?.meta.total ?? 0})
                  </h3>
                  {loadingMyWork && (
                    <span className="text-xs text-gray-400 font-medium animate-pulse">
                      Refreshing…
                    </span>
                  )}
                </div>

                {myWorkError ? (
                  <div className="p-8 text-center">
                    <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 inline-block max-w-md">
                      ⚠️ {myWorkError}
                    </div>
                    <div className="mt-3">
                      <button onClick={fetchMyWork} className="btn-secondary text-xs">
                        Try Again
                      </button>
                    </div>
                  </div>
                ) : loadingMyWork && !myWorkData ? (
                  <div className="p-12 text-center text-sm text-gray-400 space-y-2">
                    <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
                    <p>Loading your assigned tasks...</p>
                  </div>
                ) : !myWorkData?.data.length ? (
                  <div className="p-12 text-center">
                    <span className="text-3xl">🎉</span>
                    <h4 className="text-base font-bold text-gray-900 mt-2">
                      {statusFilter || priorityFilter || projectFilter || overdueFilter
                        ? 'No tasks match your filters'
                        : 'No tasks currently assigned to you'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      {statusFilter || priorityFilter || projectFilter || overdueFilter
                        ? 'Try clearing your filters to see more tasks.'
                        : 'You are all caught up! Tasks assigned to you in this organization will appear here.'}
                    </p>
                    {(statusFilter || priorityFilter || projectFilter || overdueFilter) && (
                      <button onClick={clearFilters} className="mt-4 btn-secondary text-xs">
                        Reset Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4">Task</th>
                          <th className="py-3 px-4">Project</th>
                          <th className="py-3 px-4">Priority</th>
                          <th className="py-3 px-4">Due Date</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Quick Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {myWorkData.data.map((task) => {
                          const overdue = isOverdue(task.dueDate, task.status);
                          const dueToday = isDueToday(task.dueDate, task.status);
                          const isUpdating = updatingTaskId === task.id;

                          return (
                            <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                              {/* Task Title & Snippet */}
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-gray-900 line-clamp-1">
                                  {task.title}
                                </p>
                                {task.description && (
                                  <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                                    {task.description}
                                  </p>
                                )}
                              </td>

                              {/* Project & Workspace */}
                              <td className="py-3.5 px-4 text-xs">
                                <span className="font-medium text-gray-800">
                                  {task.project.name}
                                </span>
                                <span className="text-gray-400 block text-[11px]">
                                  {task.project.workspace.name}
                                </span>
                              </td>

                              {/* Priority Pill */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                                    priorityStyles[task.priority].badge
                                  }`}
                                >
                                  {priorityStyles[task.priority].text}
                                </span>
                              </td>

                              {/* Due Date Indicator */}
                              <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                                {overdue ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                    <span>⚠️</span> {formatDate(task.dueDate)}
                                  </span>
                                ) : dueToday ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    <span>⏰</span> Today
                                  </span>
                                ) : (
                                  <span className="text-gray-600 font-medium">
                                    {formatDate(task.dueDate)}
                                  </span>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                    statusStyles[task.status].badge
                                  }`}
                                >
                                  {statusStyles[task.status].text}
                                </span>
                              </td>

                              {/* Quick Status Update Dropdown */}
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <select
                                  disabled={isUpdating}
                                  value={task.status}
                                  onChange={(e) =>
                                    handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)
                                  }
                                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-primary-500 font-medium text-gray-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {statusOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      Set to: {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {myWorkData && myWorkData.meta.totalPages > 1 && (
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                    <span>
                      Page {myWorkData.meta.page} of {myWorkData.meta.totalPages} ({myWorkData.meta.total} tasks)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={myWorkPage <= 1 || loadingMyWork}
                        onClick={() => setMyWorkPage((p) => Math.max(1, p - 1))}
                        className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <button
                        disabled={myWorkPage >= myWorkData.meta.totalPages || loadingMyWork}
                        onClick={() => setMyWorkPage((p) => p + 1)}
                        className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: PRODUCTIVITY ANALYTICS */}
          {/* ========================================================= */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Optional Project Filter for Analytics */}
              <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Productivity Scope</h3>
                  <p className="text-xs text-gray-500">
                    Live productivity metrics across authorized projects in {currentOrg.name}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={analyticsProjectFilter}
                    onChange={(e) => setAnalyticsProjectFilter(e.target.value)}
                    placeholder="Filter by Project ID"
                    className="input-field text-xs py-1.5 w-48"
                  />
                  {analyticsProjectFilter && (
                    <button
                      onClick={() => setAnalyticsProjectFilter('')}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                  <button onClick={fetchAnalytics} className="btn-secondary text-xs py-1.5 px-3">
                    Refresh
                  </button>
                </div>
              </div>

              {analyticsError ? (
                <div className="p-8 text-center card">
                  <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 inline-block max-w-md">
                    ⚠️ {analyticsError}
                  </div>
                  <div className="mt-3">
                    <button onClick={fetchAnalytics} className="btn-secondary text-xs">
                      Try Again
                    </button>
                  </div>
                </div>
              ) : loadingAnalytics && !analyticsData ? (
                <div className="p-16 text-center text-sm text-gray-400 space-y-2 card">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
                  <p>Calculating live productivity analytics...</p>
                </div>
              ) : !analyticsData ? (
                <div className="p-12 text-center text-sm text-gray-500 card">
                  No analytics data available for this organization.
                </div>
              ) : (
                <>
                  {/* Overview KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="card p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Completion Rate
                        </span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {analyticsData.overview.completionRate}%
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {analyticsData.overview.completionRate}%
                      </p>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, analyticsData.overview.completionRate)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {analyticsData.overview.completedTasks} of {analyticsData.overview.totalTasks} tasks completed
                      </p>
                    </div>

                    <div className="card p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          On-Time Rate
                        </span>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          {analyticsData.overview.onTimeCompletionRate}%
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {analyticsData.overview.onTimeCompletionRate}%
                      </p>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, analyticsData.overview.onTimeCompletionRate)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Finished on or before scheduled due date
                      </p>
                    </div>

                    <div className="card p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Assignment Coverage
                        </span>
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          {analyticsData.overview.assignmentCoverage}%
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {analyticsData.overview.assignmentCoverage}%
                      </p>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, analyticsData.overview.assignmentCoverage)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {analyticsData.overview.assignedTasks} assigned · {analyticsData.overview.unassignedTasks} unassigned
                      </p>
                    </div>

                    <div className="card p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Overdue Tasks
                        </span>
                        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          ⚠️ {analyticsData.overview.overdueTasks}
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {analyticsData.overview.overdueTasks}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {analyticsData.overview.openTasks} total open tasks currently active
                      </p>
                    </div>
                  </div>

                  {/* Distributions Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Status Distribution */}
                    <div className="card p-6 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <h4 className="text-sm font-bold text-gray-900">Task Status Distribution</h4>
                        <span className="text-xs text-gray-400 font-medium">
                          {analyticsData.overview.totalTasks} total
                        </span>
                      </div>
                      <div className="space-y-3">
                        {statusOptions.map((opt) => {
                          const count = analyticsData.statusDistribution[opt.value] ?? 0;
                          const pct =
                            analyticsData.overview.totalTasks > 0
                              ? Math.round((count / analyticsData.overview.totalTasks) * 100)
                              : 0;

                          return (
                            <div key={opt.value} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="text-gray-700">{opt.label}</span>
                                <span className="text-gray-500">
                                  {count} ({pct}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    opt.value === 'DONE'
                                      ? 'bg-emerald-500'
                                      : opt.value === 'IN_PROGRESS'
                                      ? 'bg-blue-500'
                                      : opt.value === 'IN_REVIEW'
                                      ? 'bg-purple-500'
                                      : 'bg-gray-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Priority Distribution */}
                    <div className="card p-6 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <h4 className="text-sm font-bold text-gray-900">Task Priority Distribution</h4>
                        <span className="text-xs text-gray-400 font-medium">
                          {analyticsData.overview.totalTasks} total
                        </span>
                      </div>
                      <div className="space-y-3">
                        {priorityOptions.map((opt) => {
                          const count = analyticsData.priorityDistribution[opt.value] ?? 0;
                          const pct =
                            analyticsData.overview.totalTasks > 0
                              ? Math.round((count / analyticsData.overview.totalTasks) * 100)
                              : 0;

                          return (
                            <div key={opt.value} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="text-gray-700">{opt.label}</span>
                                <span className="text-gray-500">
                                  {count} ({pct}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    opt.value === 'URGENT'
                                      ? 'bg-rose-500'
                                      : opt.value === 'HIGH'
                                      ? 'bg-amber-500'
                                      : opt.value === 'MEDIUM'
                                      ? 'bg-blue-500'
                                      : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Project Progress */}
                  <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <h4 className="text-sm font-bold text-gray-900">Project Progress Overview</h4>
                      <span className="text-xs text-gray-400 font-medium">
                        {analyticsData.projectProgress.length} active project(s)
                      </span>
                    </div>

                    {analyticsData.projectProgress.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center">No projects found.</p>
                    ) : (
                      <div className="space-y-4">
                        {analyticsData.projectProgress.map((proj) => (
                          <div key={proj.id} className="p-4 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm font-semibold text-gray-900">
                              <span>{proj.name}</span>
                              <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                                {proj.progressPercentage}% Completed
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, proj.progressPercentage)}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>Total: {proj.totalTasks}</span>
                              <span>Completed: {proj.completedTasks}</span>
                              {proj.overdueTasks > 0 && (
                                <span className="text-rose-600 font-bold">
                                  ⚠️ Overdue: {proj.overdueTasks}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignee Workload Table */}
                  <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <h4 className="text-sm font-bold text-gray-900">Workload by Assignee</h4>
                      <span className="text-xs text-gray-400 font-medium">
                        {analyticsData.workloadByAssignee.length} team assignee(s)
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <th className="py-3 px-4">Member</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4 text-center">Open Tasks</th>
                            <th className="py-3 px-4 text-center">Due Today</th>
                            <th className="py-3 px-4 text-center">Overdue</th>
                            <th className="py-3 px-4 text-center">Completed</th>
                            <th className="py-3 px-4 text-center">Total Tasks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {analyticsData.workloadByAssignee.map((item, idx) => (
                            <tr key={item.userId ?? `unassigned-${idx}`} className="hover:bg-gray-50 transition-colors">
                              <td className="py-3 px-4 font-medium text-gray-900 flex items-center gap-2">
                                <span
                                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                    item.userId === null
                                      ? 'bg-gray-200 text-gray-600'
                                      : 'bg-primary-100 text-primary-700'
                                  }`}
                                >
                                  {item.name.charAt(0).toUpperCase()}
                                </span>
                                <span>{item.name}</span>
                              </td>
                              <td className="py-3 px-4 text-xs text-gray-500">
                                {item.email ?? '—'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="font-bold text-gray-900 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">
                                  {item.openTasks}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center text-xs font-medium text-gray-700">
                                {item.dueTodayTasks > 0 ? (
                                  <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">
                                    {item.dueTodayTasks}
                                  </span>
                                ) : (
                                  '0'
                                )}
                              </td>
                              <td className="py-3 px-4 text-center text-xs font-medium">
                                {item.overdueTasks > 0 ? (
                                  <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                    {item.overdueTasks}
                                  </span>
                                ) : (
                                  '0'
                                )}
                              </td>
                              <td className="py-3 px-4 text-center text-xs font-medium text-emerald-700">
                                {item.completedTasks}
                              </td>
                              <td className="py-3 px-4 text-center text-xs font-bold text-gray-900">
                                {item.totalTasks}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: ORGANIZATION & MEMBERS */}
          {/* ========================================================= */}
          {activeTab === 'organization' && (
            <div className="space-y-6">
              {/* Quick Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Organization Role
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xl font-bold text-gray-900">{currentOrg.role || 'MEMBER'}</span>
                    {currentOrg.role && <RoleBadge role={currentOrg.role} />}
                  </div>
                </div>

                <div className="card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total Members
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {currentOrg.memberCount ?? members.length}
                  </p>
                </div>

                <div className="card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Tenant Isolation
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-semibold text-green-700">Server-Enforced</span>
                  </div>
                </div>

                <div className="card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Tenant Slug
                  </p>
                  <p className="text-sm font-mono text-gray-700 mt-2 truncate bg-gray-50 p-1.5 rounded border border-gray-100">
                    /{currentOrg.slug}
                  </p>
                </div>
              </div>

              {/* Members List & Invitation Card */}
              <div className="card p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Organization Members</h2>
                    <p className="text-xs text-gray-500">
                      All active team members registered under {currentOrg.name}.
                    </p>
                  </div>

                  {currentOrg.role === 'OWNER' && (
                    <div className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200">
                      ✨ As OWNER, you can invite and manage members.
                    </div>
                  )}
                </div>

                {/* Invite Member Form (OWNER only) */}
                {currentOrg.role === 'OWNER' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-2">Invite a Member</h3>
                    {memberError && (
                      <p className="mb-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                        {memberError}
                      </p>
                    )}
                    {memberSuccess && (
                      <p className="mb-3 text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                        {memberSuccess}
                      </p>
                    )}

                    <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="email"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        placeholder="User's registered email"
                        className="input-field text-sm flex-1"
                        required
                        disabled={addingMember}
                      />
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as 'EMPLOYEE' | 'MANAGER' | 'OWNER')}
                        className="input-field text-sm sm:w-40"
                        disabled={addingMember}
                      >
                        <option value="EMPLOYEE">EMPLOYEE</option>
                        <option value="MANAGER">MANAGER</option>
                        <option value="OWNER">OWNER</option>
                      </select>
                      <button
                        type="submit"
                        className="btn-primary text-sm whitespace-nowrap"
                        disabled={addingMember}
                      >
                        {addingMember ? 'Adding...' : 'Add Member'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Members Table */}
                {loadingMembers ? (
                  <div className="py-8 text-center text-gray-400 text-sm">Loading members...</div>
                ) : members.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No members found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Email</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {members.map((member) => (
                          <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 font-medium text-gray-900 flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 font-bold text-xs flex items-center justify-center">
                                {member.user.name.charAt(0).toUpperCase()}
                              </span>
                              <span>{member.user.name}</span>
                            </td>
                            <td className="py-3 px-4 text-gray-500">{member.user.email}</td>
                            <td className="py-3 px-4">
                              <RoleBadge role={member.role} />
                            </td>
                            <td className="py-3 px-4 text-gray-400 text-xs">
                              {new Date(member.joinedAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal for Creating Organization */}
      <CreateOrgModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
