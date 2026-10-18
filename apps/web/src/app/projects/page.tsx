'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api-client';
import type { ProjectResponse, WorkspaceResponse } from '@qveto/shared';

type Page<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
type ProjectRow = ProjectResponse & { workspaceName: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.error.message : fallback;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = currentOrg?.role === 'OWNER' || currentOrg?.role === 'MANAGER';

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!currentOrg) {
      setProjects([]);
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
    } finally {
      setLoading(false);
    }
  }, [currentOrg, includeArchived]);

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
      {!currentOrg ? (
        <section className="card p-8 text-center text-sm text-gray-600">Select an organization to view its projects.</section>
      ) : (
        <>
          {canCreate && (
            <section className="card p-5">
              <h2 className="text-base font-semibold text-gray-900">Project creation</h2>
              <p className="mt-1 text-sm text-gray-600">Creation and settings updates will be enabled after the coordinated Project persistence changes are ready.</p>
            </section>
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
