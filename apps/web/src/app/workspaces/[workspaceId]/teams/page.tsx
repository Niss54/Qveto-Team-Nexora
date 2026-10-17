'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { TeamResponse, WorkspaceResponse } from '@qveto/shared';

interface OrgMemberOption { userId: string; role: string; user: { id: string; name: string; email: string } }

export default function WorkspaceTeamsPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const router = useRouter();
  const { user, organizations, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const role = workspace ? organizations.find((org) => org.id === workspace.orgId)?.role : undefined;
  const canManage = role === 'OWNER' || role === 'MANAGER';

  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const workspaceResult = await api.get<{ workspace: WorkspaceResponse }>(`/api/workspaces/${workspaceId}`);
      setWorkspace(workspaceResult.workspace);
      const [teamResult, memberResult] = await Promise.all([
        api.get<{ teams: TeamResponse[] }>(`/api/workspaces/${workspaceId}/teams`),
        api.get<{ members: OrgMemberOption[] }>(`/api/organizations/${workspaceResult.workspace.orgId}/members`),
      ]);
      setTeams(teamResult.teams);
      setMembers(memberResult.members);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not load teams.');
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const createTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      await api.post(`/api/workspaces/${workspaceId}/teams`, { name: name.trim(), description: description.trim() || null });
      setName(''); setDescription(''); setNotice('Team created.'); await load();
    } catch (err) { setError(err instanceof ApiClientError ? err.error.message : 'Could not create team.'); }
    finally { setSaving(false); }
  };

  const mutateMember = async (team: TeamResponse, userId: string, add: boolean) => {
    setError(null); setNotice(null);
    try {
      if (add) await api.post(`/api/teams/${team.id}/members`, { userId });
      else await api.delete(`/api/teams/${team.id}/members/${userId}`);
      setNotice(add ? 'Member added to team.' : 'Member removed from team.'); await load();
    } catch (err) { setError(err instanceof ApiClientError ? err.error.message : 'Could not update team roster.'); }
  };

  const updateTeam = async (event: React.FormEvent<HTMLFormElement>, team: TeamResponse) => {
    event.preventDefault();
    setError(null); setNotice(null); setSaving(true);
    try {
      await api.patch(`/api/teams/${team.id}`, { name: editName.trim(), description: editDescription.trim() || null });
      setNotice('Team updated.'); setEditingTeamId(null); await load();
    } catch (err) { setError(err instanceof ApiClientError ? err.error.message : 'Could not update team.'); }
    finally { setSaving(false); }
  };

  if (authLoading || !user || loading) return <div className="mx-auto max-w-5xl p-8 text-center text-gray-500">Loading teams…</div>;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href={`/workspaces/${workspaceId}`} className="text-sm font-medium text-primary-700 hover:underline">← {workspace?.name ?? 'Workspace'}</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Teams</h1>
        <p className="mt-1 text-sm text-gray-600">Manage teams and their organization members in this workspace.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {canManage && !workspace?.archivedAt && (
        <form onSubmit={createTeam} className="card grid gap-3 p-5 sm:grid-cols-2">
          <h2 className="text-base font-semibold text-gray-900 sm:col-span-2">Create team</h2>
          <label className="space-y-1 text-sm font-medium text-gray-700">Name
            <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">Description
            <input className="input-field w-full" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          </label>
          <div className="sm:col-span-2"><button className="btn-primary text-sm" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create team'}</button></div>
        </form>
      )}
      {teams.length === 0 ? (
        <section className="card p-8 text-center text-sm text-gray-600">No teams are available in this workspace.</section>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const assignedIds = new Set((team.members ?? []).map((member) => member.userId));
            const available = members.filter((member) => !assignedIds.has(member.userId));
            return (
              <section key={team.id} className="card space-y-4 p-5">
                {canManage && editingTeamId === team.id ? (
                  <form onSubmit={(event) => void updateTeam(event, team)} className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-gray-700">Name
                      <input className="input-field w-full" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} required />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">Description
                      <input className="input-field w-full" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button className="btn-primary text-xs" disabled={saving || !editName.trim()}>Save</button>
                      <button className="btn-secondary text-xs" type="button" onClick={() => setEditingTeamId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-semibold text-gray-900">{team.name}</h2><p className="mt-1 text-sm text-gray-600">{team.description || 'No description'}</p></div>
                    {canManage && <button className="text-xs text-primary-700 hover:underline" onClick={() => { setEditingTeamId(team.id); setEditName(team.name); setEditDescription(team.description ?? ''); }}>Edit</button>}
                  </div>
                )}
                <div className="space-y-2">
                  {(team.members ?? []).length === 0 ? <p className="text-sm text-gray-500">No members yet.</p> : (team.members ?? []).map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                      <span>{member.user.name} <span className="text-gray-500">{member.user.email}</span></span>
                      {canManage && <button className="text-xs text-red-700 hover:underline" onClick={() => void mutateMember(team, member.userId, false)}>Remove</button>}
                    </div>
                  ))}
                </div>
                {canManage && available.length > 0 && (
                  <label className="flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:items-center">
                    Add organization member
                    <select className="input-field" defaultValue="" onChange={(event) => { if (event.target.value) void mutateMember(team, event.target.value, true); }}>
                      <option value="">Choose member</option>
                      {available.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} ({member.user.email})</option>)}
                    </select>
                  </label>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
