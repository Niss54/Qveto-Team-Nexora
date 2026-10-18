'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import { createProjectSchema, type OrgMemberResponse, type ProjectResponse, type ProjectStatus, type WorkspaceResponse } from '@qveto/shared';

type Page<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
type ProjectRow = ProjectResponse & { workspaceName: string };
type OrgMembersResponse = { data?: OrgMemberResponse[]; members?: OrgMemberResponse[] };
const writableStatuses: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.error.message : fallback;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberResponse[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
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
      setOrgMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const workspaceQuery = new URLSearchParams({ page: '1', pageSize: '100' });
      if (currentOrg.role === 'OWNER' || currentOrg.role === 'MANAGER') workspaceQuery.set('includeArchived', 'true');
      const firstPage = await api.get<Page<WorkspaceResponse>>(
        `/api/organizations/${encodeURIComponent(currentOrg.id)}/workspaces?${workspaceQuery.toString()}`,
      );
      const workspacePages = [firstPage];
      for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
        workspaceQuery.set('page', String(page));
        workspacePages.push(await api.get<Page<WorkspaceResponse>>(
          `/api/organizations/${encodeURIComponent(currentOrg.id)}/workspaces?${workspaceQuery.toString()}`,
        ));
      }
      const visibleWorkspaces = workspacePages.flatMap((result) => result.data);
      setWorkspaces(visibleWorkspaces.filter((workspace) => !workspace.archivedAt));
      if (currentOrg.role === 'OWNER' || currentOrg.role === 'MANAGER') {
        const members = await api.get<OrgMembersResponse>(`/api/organizations/${encodeURIComponent(currentOrg.id)}/members`);
        const availableMembers = Array.isArray(members.data) ? members.data : members.members ?? [];
        setOrgMembers(availableMembers);
        setOwnerId(availableMembers[0]?.userId ?? '');
      } else {
        setOrgMembers([]);
        setOwnerId('');
      }
      setWorkspaceId((current) => current && visibleWorkspaces.some((workspace) => workspace.id === current && !workspace.archivedAt)
        ? current
        : visibleWorkspaces.find((workspace) => !workspace.archivedAt)?.id ?? '');
      const projectPages = await Promise.all(visibleWorkspaces.map(async (workspace) => {
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
        }));
      setProjects(projectPages.flat());
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load projects.'));
      setProjects([]);
      setWorkspaces([]);
      setOrgMembers([]);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, includeArchived]);

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      const parsed = createProjectSchema.safeParse({
        name,
        description: description.trim() || null,
        ownerId,
        status,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the project details and try again.');
        return;
      }
      await api.post(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
        ...parsed.data,
        startDate: parsed.data.startDate?.toISOString() ?? null,
        dueDate: parsed.data.dueDate?.toISOString() ?? null,
      });
      setName('');
      setDescription('');
      setStartDate('');
      setDueDate('');
      setStatus('ACTIVE');
      setNotice('Project created.');
      await load();
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create project.'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { void load(); }, [load]);

  if (authLoading || !user) {
    return <div className="mx-auto max-w-5xl p-8 text-center text-gray-500">Loading projects…</div>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{currentOrg?.name ?? 'No organization selected'}</p>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-600">Projects are scoped to workspace and organization membership.</p>
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
            <form onSubmit={createProject} className="card grid gap-3 p-5 sm:grid-cols-2">
              <h2 className="text-base font-semibold text-gray-900 sm:col-span-2">Create project</h2>
              <label className="space-y-1 text-sm font-medium text-gray-700">Workspace
                <select className="input-field w-full" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
                  <option value="">Select an active workspace</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Project owner
                <select className="input-field w-full" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
                  <option value="">Select an organization member</option>
                  {orgMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Name
                <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Status
                <select className="input-field w-full" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
                  {writableStatuses.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">Description
                <textarea className="input-field min-h-20 w-full" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Start date
                <input className="input-field w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">Due date
                <input className="input-field w-full" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary text-sm" type="submit" disabled={saving || !workspaceId || !ownerId || !name.trim()}>
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
