'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { OrgMemberResponse, ProjectMemberResponse, ProjectResponse, WorkspaceResponse } from '@qveto/shared';

type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
type ProjectDetailResponse = { project: ProjectResponse };
type MemberListResponse = { members: ProjectMemberResponse[] };
type OrgMembersResponse = { data?: OrgMemberResponse[]; members?: OrgMemberResponse[] };
const statuses: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.error.message : fallback;
}
function dateValue(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}
function dateAtUtcMidnight(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const { user, currentOrg, loading: authLoading } = useAuth();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [members, setMembers] = useState<ProjectMemberResponse[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberResponse[]>([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isArchived = project?.status === 'ARCHIVED';
  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'MANAGER' || project?.ownerId === user?.id;
  const projectMemberIds = new Set(members.map((member) => member.userId));
  const candidateMembers = orgMembers.filter((member) => !projectMemberIds.has(member.userId));

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!projectId || !currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
      const [workspaceResult, memberResult, orgMemberResult] = await Promise.all([
        api.get<{ workspace: WorkspaceResponse }>(`/api/workspaces/${encodeURIComponent(result.project.workspaceId)}`),
        api.get<MemberListResponse>(`/api/projects/${encodeURIComponent(projectId)}/members`),
        api.get<OrgMembersResponse>(`/api/organizations/${encodeURIComponent(currentOrg.id)}/members`),
      ]);
      const availableOrgMembers = Array.isArray(orgMemberResult.data) ? orgMemberResult.data : orgMemberResult.members ?? [];
      setProject(result.project);
      setWorkspace(workspaceResult.workspace);
      setMembers(memberResult.members);
      setOrgMembers(availableOrgMembers);
      setName(result.project.name);
      setDescription(result.project.description ?? '');
      setOwnerId(result.project.ownerId ?? '');
      setStatus(statuses.includes(result.project.status as ProjectStatus) ? result.project.status as ProjectStatus : 'ACTIVE');
      setStartDate(dateValue(result.project.startDate));
      setDueDate(dateValue(result.project.dueDate));
      setSelectedMember((current) => current || availableOrgMembers.find((member) => !memberResult.members.some((existing) => existing.userId === member.userId))?.userId || '');
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load project.'));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentOrg]);

  useEffect(() => { void load(); }, [load]);

  const updateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || isArchived) return;
    if (startDate && dueDate && startDate > dueDate) {
      setError('Start date must be on or before the due date.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.patch<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(project.id)}`, {
        name: name.trim(),
        description: description.trim() || null,
        ownerId,
        status,
        startDate: dateAtUtcMidnight(startDate),
        dueDate: dateAtUtcMidnight(dueDate),
      });
      setProject(result.project);
      setNotice('Project updated.');
      await load();
    } catch (updateError) {
      setError(errorMessage(updateError, 'Could not update project.'));
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (archive: boolean) => {
    if (!project) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<ProjectDetailResponse>(
        `/api/projects/${encodeURIComponent(project.id)}/${archive ? 'archive' : 'restore'}`,
        {},
      );
      setProject(result.project);
      setNotice(archive ? 'Project archived.' : 'Project restored.');
      await load();
    } catch (archiveError) {
      setError(errorMessage(archiveError, 'Could not change project lifecycle.'));
    } finally {
      setSaving(false);
    }
  };

  const changeMember = async (userId: string, add: boolean) => {
    if (!project) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (add) {
        await api.post(`/api/projects/${encodeURIComponent(project.id)}/members`, { userId });
        setNotice('Project member added.');
      } else {
        await api.delete(`/api/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(userId)}`);
        setNotice('Project member removed.');
      }
      if (add) setSelectedMember('');
      await load();
    } catch (memberError) {
      setError(errorMessage(memberError, 'Could not update project membership.'));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || loading) {
    return <div className="mx-auto max-w-5xl p-8 text-center text-gray-500">Loading project…</div>;
  }
  if (!project) {
    return <main className="mx-auto max-w-4xl space-y-4 px-4 py-8"><p role="alert" className="text-sm text-red-700">{error ?? 'Project not found.'}</p><Link className="text-sm text-primary-700 hover:underline" href="/projects">← Projects</Link></main>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/projects" className="text-sm font-medium text-primary-700 hover:underline">← Projects</Link>
          <p className="mt-2 text-sm text-gray-500">{workspace?.name ?? 'Workspace'}</p>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="mt-1 text-sm text-gray-600">{project.description || 'No description'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-sm" type="button" onClick={() => {
            window.sessionStorage.setItem('qveto-prd03-project-id', project.id);
            router.push('/tasks');
          }}>Open tasks</button>
          {canManage && <button className="btn-secondary text-sm" type="button" disabled={saving} onClick={() => void setArchived(!isArchived)}>{isArchived ? 'Restore project' : 'Archive project'}</button>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {isArchived && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">This project is archived. Existing task data remains available; changes are disabled until it is restored.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <form onSubmit={updateProject} className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-base font-semibold text-gray-900 sm:col-span-2">Project details</h2>
          <label className="space-y-1 text-sm font-medium text-gray-700">Name
            <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={!canManage || isArchived} />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">Owner
            <select className="input-field w-full" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={!canManage || isArchived} required>
              {!ownerId && <option value="" disabled>Select an organization member</option>}
              {orgMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} ({member.user.email})</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">Description
            <textarea className="input-field min-h-20 w-full" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} disabled={!canManage || isArchived} />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">Status
            <select className="input-field w-full" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} disabled={!canManage || isArchived}>
              {statuses.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">Start date
            <input className="input-field w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!canManage || isArchived} />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">Due date
            <input className="input-field w-full" type="date" min={startDate || undefined} value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!canManage || isArchived} />
          </label>
          {canManage && <div className="sm:col-span-2"><button className="btn-primary text-sm" type="submit" disabled={saving || isArchived || !ownerId}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
        </form>

        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Project members</h2>
            <p className="mt-1 text-xs text-gray-500">Membership is limited to users in this organization.</p>
          </div>
          {canManage && !isArchived && (
            <div className="flex gap-2">
              <select className="input-field min-w-0 flex-1" value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} aria-label="Organization member to add">
                <option value="">Select a member</option>
                {candidateMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
              </select>
              <button className="btn-primary text-xs" type="button" disabled={saving || !selectedMember} onClick={() => void changeMember(selectedMember, true)}>Add</button>
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{member.user.name}</p>
                  <p className="truncate text-xs text-gray-500">{member.user.email} · {member.role}</p>
                </div>
                {canManage && !isArchived && member.userId !== project.ownerId && (
                  <button className="text-xs text-red-700 hover:underline" type="button" disabled={saving} onClick={() => void changeMember(member.userId, false)}>Remove</button>
                )}
              </li>
            ))}
            {!members.length && <li className="py-3 text-sm text-gray-500">No project members.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
