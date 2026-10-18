'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { OrgMemberResponse, ProjectResponse, WorkspaceResponse } from '@qveto/shared';

type Page<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
type ProjectRow = ProjectResponse & { workspaceName: string };
type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';

const statuses: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.error.message : fallback;
}

function dateAtUtcMidnight(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([]);
  const [members, setMembers] = useState<OrgMemberResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canCreate = currentOrg?.role === 'OWNER' || currentOrg?.role === 'MANAGER';

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!currentOrg) {
      setProjects([]);
      setWorkspaces([]);
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const firstPage = await api.get<Page<WorkspaceResponse>>(
        `/api/organizations/${encodeURIComponent(currentOrg.id)}/workspaces?page=1&pageSize=100`,
      );
      const workspacePages = [firstPage];
      for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
        workspacePages.push(await api.get<Page<WorkspaceResponse>>(
          `/api/organizations/${encodeURIComponent(currentOrg.id)}/workspaces?page=${page}&pageSize=100`,
        ));
      }
      const activeWorkspaces = workspacePages.flatMap((result) => result.data).filter((workspace) => !workspace.archivedAt);
      const [projectPages, memberResult] = await Promise.all([
        Promise.all(activeWorkspaces.map(async (workspace) => {
          const projects: ProjectResponse[] = [];
          let page = 1;
          let totalPages = 1;
          while (page <= totalPages) {
            const params = new URLSearchParams({ page: String(page), pageSize: '100' });
            if (includeArchived) params.set('includeArchived', 'true');
            const result = await api.get<Page<ProjectResponse>>(
              `/api/workspaces/${encodeURIComponent(workspace.id)}/projects?${params.toString()}`,
            );
            projects.push(...result.data);
            totalPages = result.meta.totalPages;
            page += 1;
          }
          return projects.map((project) => ({ ...project, workspaceName: workspace.name }));
        })),
        api.get<{ data?: OrgMemberResponse[]; members?: OrgMemberResponse[] }>(
          `/api/organizations/${encodeURIComponent(currentOrg.id)}/members`,
        ),
      ]);
      setWorkspaces(activeWorkspaces);
      setProjects(projectPages.flat());
      const orgMembers = Array.isArray(memberResult.data) ? memberResult.data : memberResult.members ?? [];
      setMembers(orgMembers);
      setWorkspaceId((current) => current || activeWorkspaces[0]?.id || '');
      setOwnerId((current) => current || orgMembers.find((member) => member.userId === user?.id)?.userId || orgMembers[0]?.userId || '');
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load projects.'));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, includeArchived, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !name.trim() || !ownerId) return;
    if (startDate && dueDate && startDate > dueDate) {
      setError('Start date must be on or before the due date.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
        name: name.trim(),
        description: description.trim() || null,
        ownerId,
        status,
        startDate: dateAtUtcMidnight(startDate),
        dueDate: dateAtUtcMidnight(dueDate),
      });
      setName('');
      setDescription('');
      setStartDate('');
      setDueDate('');
      setNotice('Project created.');
      await load();
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create project.'));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return <div className="mx-auto max-w-5xl p-8 text-center text-gray-500">Loading projects…</div>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{currentOrg?.name ?? 'No organization selected'}</p>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-600">Projects are scoped to active workspaces and organization membership.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          Include archived projects
        </label>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {!currentOrg ? (
        <section className="card p-8 text-center text-sm text-gray-600">Select an organization to view its projects.</section>
      ) : (
        <>
          {canCreate && (
            <form onSubmit={createProject} className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <h2 className="text-base font-semibold text-gray-900 sm:col-span-2 lg:col-span-3">Create project</h2>
              <label className="space-y-1 text-sm font-medium text-gray-700">Workspace
                <select className="input-field w-full" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Name
                <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Owner
                <select className="input-field w-full" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
                  {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} ({member.user.email})</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Description
                <input className="input-field w-full" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Status
                <select className="input-field w-full" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
                  {statuses.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Start date
                <input className="input-field w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Due date
                <input className="input-field w-full" type="date" min={startDate || undefined} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button className="btn-primary text-sm" type="submit" disabled={saving || !workspaces.length || !members.length || !name.trim()}>
                  {saving ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </form>
          )}

          <section className="card overflow-hidden">
            {loading ? <div className="p-8 text-center text-sm text-gray-500">Loading projects…</div> : !projects.length ? (
              <div className="p-8 text-center">
                <h2 className="font-semibold text-gray-900">No projects found</h2>
                <p className="mt-1 text-sm text-gray-500">Create a project in an active workspace to get started.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {projects.map((project) => (
                  <li key={project.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/projects/${encodeURIComponent(project.id)}`} className="font-semibold text-primary-700 hover:underline">{project.name}</Link>
                      <p className="mt-1 truncate text-xs text-gray-500">{project.workspaceName} · {project.description || 'No description'}</p>
                      <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{project.status.replace('_', ' ')}</span>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/projects/${encodeURIComponent(project.id)}`} className="btn-secondary text-xs">Details</Link>
                      <button className="btn-secondary text-xs" type="button" onClick={() => {
                        window.sessionStorage.setItem('qveto-prd03-project-id', project.id);
                        router.push('/tasks');
                      }}>Open tasks</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
