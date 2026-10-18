'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { WorkspaceResponse } from '@qveto/shared';

interface WorkspacePageResponse {
  data: WorkspaceResponse[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export default function WorkspacesPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();
  const [result, setResult] = useState<WorkspacePageResponse | null>(null);
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = currentOrg?.role === 'OWNER' || currentOrg?.role === 'MANAGER';

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const loadWorkspaces = useCallback(async () => {
    if (!currentOrg) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (includeArchived) params.set('includeArchived', 'true');
      const response = await api.get<WorkspacePageResponse>(
        `/api/organizations/${currentOrg.id}/workspaces?${params.toString()}`,
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not load workspaces.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, page, includeArchived]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const createWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentOrg || !name.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/organizations/${currentOrg.id}/workspaces`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setName('');
      setDescription('');
      setNotice('Workspace created.');
      setPage(1);
      await loadWorkspaces();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (workspace: WorkspaceResponse, archive: boolean) => {
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/workspaces/${workspace.id}/${archive ? 'archive' : 'restore'}`, {});
      setNotice(archive ? 'Workspace archived.' : 'Workspace restored.');
      await loadWorkspaces();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : 'Could not update workspace.');
    }
  };

  if (authLoading || !user) {
    return <div className="mx-auto max-w-5xl p-8 text-center text-gray-500">Loading workspaces...</div>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{currentOrg?.name ?? 'No organization selected'}</p>
          <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
          <p className="mt-1 text-sm text-gray-600">Organize teams and projects within your organization.</p>
        </div>
        {canManage && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => { setPage(1); setIncludeArchived(event.target.checked); }}
            />
            Include archived
          </label>
        )}
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {!currentOrg ? (
        <section className="card p-8 text-center text-sm text-gray-600">Select an organization to view its workspaces.</section>
      ) : (
        <>
          {canManage && (
            <form onSubmit={createWorkspace} className="card grid gap-3 p-5 sm:grid-cols-2">
              <h2 className="text-base font-semibold text-gray-900 sm:col-span-2">Create workspace</h2>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Name
                <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                Description
                <input className="input-field w-full" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary text-sm" type="submit" disabled={saving || !name.trim()}>
                  {saving ? 'Creating…' : 'Create workspace'}
                </button>
              </div>
            </form>
          )}

          <section className="card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading workspaces…</div>
            ) : !result?.data.length ? (
              <div className="p-8 text-center">
                <h2 className="font-semibold text-gray-900">No workspaces found</h2>
                <p className="mt-1 text-sm text-gray-500">Create a workspace to start organizing teams and projects.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {result.data.map((workspace) => (
                  <li key={workspace.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/workspaces/${workspace.id}`} className="font-semibold text-primary-700 hover:underline">
                        {workspace.name}
                      </Link>
                      <p className="mt-1 truncate text-xs text-gray-500">/{workspace.slug} · {workspace.description || 'No description'}</p>
                      {workspace.archivedAt && <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Archived</span>}
                    </div>
                    {canManage && (
                      <button className="btn-secondary shrink-0 text-xs" type="button" onClick={() => void setArchived(workspace, !workspace.archivedAt)}>
                        {workspace.archivedAt ? 'Restore' : 'Archive'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {result && result.meta.totalPages > 1 && (
              <nav aria-label="Workspace pages" className="flex items-center justify-between border-t border-gray-100 p-4 text-sm">
                <button className="btn-secondary text-xs" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
                <span className="text-gray-500">Page {result.meta.page} of {result.meta.totalPages}</span>
                <button className="btn-secondary text-xs" disabled={page >= result.meta.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
              </nav>
            )}
          </section>
        </>
      )}
    </main>
  );
}
