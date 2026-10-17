'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { WorkspaceResponse } from '@qveto/shared';

export default function WorkspaceDetailPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const router = useRouter();
  const { user, currentOrg, organizations, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const workspaceOrgRole = workspace
    ? organizations.find((organization) => organization.id === workspace.orgId)?.role
    : undefined;
  const canManage = workspaceOrgRole === 'OWNER' || workspaceOrgRole === 'MANAGER';

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const loadWorkspace = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ workspace: WorkspaceResponse }>(`/api/workspaces/${workspaceId}`);
      setWorkspace(response.workspace);
      setName(response.workspace.name);
      setDescription(response.workspace.description ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not load this workspace.');
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.patch<{ workspace: WorkspaceResponse }>(`/api/workspaces/${workspace.id}`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setWorkspace(response.workspace);
      setName(response.workspace.name);
      setDescription(response.workspace.description ?? '');
      setNotice('Workspace updated. Its slug remains unchanged.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not update workspace.');
    } finally {
      setSaving(false);
    }
  };

  const changeArchiveState = async () => {
    if (!workspace) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const action = workspace.archivedAt ? 'restore' : 'archive';
      const response = await api.post<{ workspace: WorkspaceResponse }>(`/api/workspaces/${workspace.id}/${action}`, {});
      setWorkspace(response.workspace);
      setNotice(workspace.archivedAt ? 'Workspace restored.' : 'Workspace archived. Existing teams and projects are retained.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not update workspace.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || loading) {
    return <div className="mx-auto max-w-4xl p-8 text-center text-gray-500">Loading workspace…</div>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/workspaces" className="text-sm font-medium text-primary-700 hover:underline">← Workspaces</Link>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {!workspace ? (
        <section className="card p-8 text-center text-sm text-gray-600">Workspace could not be displayed.</section>
      ) : (
        <>
          <header>
            <p className="text-sm text-gray-500">{currentOrg?.name ?? 'Organization workspace'}</p>
            <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
          </header>
          <section className="card space-y-5 p-5">
            <div className="border-b border-gray-100 pb-4">
              <Link href={`/workspaces/${workspace.id}/teams`} className="btn-secondary text-sm">View teams</Link>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Workspace slug</p>
              <p className="mt-1 font-mono text-sm text-gray-800">{workspace.slug}</p>
            </div>
            {workspace.archivedAt && <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">Archived on {new Date(workspace.archivedAt).toLocaleDateString()}.</p>}
            {canManage && (
              <form onSubmit={save} className="space-y-4 border-t border-gray-100 pt-5">
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  Name
                  <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
                </label>
                <label className="block space-y-1 text-sm font-medium text-gray-700">
                  Description
                  <textarea className="input-field w-full resize-y" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary text-sm" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>
                  <button className="btn-secondary text-sm" type="button" onClick={() => void changeArchiveState()} disabled={saving}>
                    {workspace.archivedAt ? 'Restore workspace' : 'Archive workspace'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
