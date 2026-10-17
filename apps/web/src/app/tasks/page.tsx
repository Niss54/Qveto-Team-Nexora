'use client';

import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  position: number;
  parentTaskId: string | null;
  dueDate: string | null;
  startDate?: string | null;
  assigneeId?: string | null;
  updatedAt?: string;
  completedAt: string | null;
};
type Label = { id: string; name: string; color: string };
type OrgMember = { userId: string; user: { id: string; name: string; email: string } };

function dateValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}
function isoDate(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}
type Board = { columns: Record<Status, Task[]>; total: number };

const statuses: Status[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const names: Record<Status, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};
const emptyColumns = (): Record<Status, Task[]> => ({ TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] });
const projectKey = 'qveto-prd03-project-id';

function message(error: unknown): string {
  if (error instanceof ApiClientError) return error.error.message || `Request failed (${error.status})`;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function TasksPage() {
  const router = useRouter();
  const { user, loading: authLoading, currentOrg } = useAuth();
  const [projectInput, setProjectInput] = useState('');
  const [projectId, setProjectId] = useState('');
  const [board, setBoard] = useState<Board>({ columns: emptyColumns(), total: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<Status>('TODO');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [status, setStatus] = useState<Status>('TODO');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersError, setMembersError] = useState('');
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(projectKey) || '';
    setProjectInput(stored);
    setProjectId(stored);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId || !currentOrg) {
      setBoard({ columns: emptyColumns(), total: 0 });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.get<Board>(`/api/projects/${encodeURIComponent(projectId)}/kanban`);
      setBoard(result);
    } catch (err) {
      setError(message(err));
      setBoard({ columns: emptyColumns(), total: 0 });
    } finally {
      setLoading(false);
    }
  }, [projectId, currentOrg]);

  useEffect(() => { void refresh(); }, [refresh]);


  const chooseProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = projectInput.trim();
    window.sessionStorage.setItem(projectKey, value);
    setSelected(null);
    setProjectId(value);
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !newTaskTitle.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
        title: newTaskTitle.trim(), description: newTaskDescription.trim() || null, status: newTaskStatus, priority: newTaskPriority,
      });
      setNewTaskTitle(''); setNewTaskDescription('');
      await refresh();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const move = async (taskId: string, destination: Status, targetIndex: number) => {
    if (!projectId || busy) return;
    setBusy(true); setError('');
    try {
      await api.patch(`/api/projects/${encodeURIComponent(projectId)}/kanban/move`, {
        taskId, status: destination, targetIndex,
      });
      await refresh();
    } catch (err) { setError(message(err)); await refresh(); }
    finally { setBusy(false); setDraggedId(null); }
  };

  const openTask = async (task: Task) => {
    setSelected(task); setEditing(false); setLabels([]); setSubtasks([]);
    setTitle(task.title); setDescription(task.description ?? ''); setPriority(task.priority);
    setStatus(task.status); setStartDate(dateValue(task.startDate));
    setDueDate(dateValue(task.dueDate)); setAssigneeId(task.assigneeId ?? '');
    setMembers([]); setMembersError(''); setError('');
    try {
      const [detail, assigned, available, children] = await Promise.all([
        api.get<{ task: Task }>(`/api/tasks/${task.id}`),
        api.get<{ data: Label[] }>(`/api/tasks/${task.id}/labels`),
        api.get<{ data: Label[] }>(`/api/projects/${encodeURIComponent(projectId)}/labels`),
        api.get<{ data: Task[] }>(`/api/tasks/${task.id}/subtasks`),
      ]);
      const full = detail.task;
      setSelected(full);
      setTitle(full.title); setDescription(full.description ?? ''); setPriority(full.priority);
      setStatus(full.status); setStartDate(dateValue(full.startDate));
      setDueDate(dateValue(full.dueDate)); setAssigneeId(full.assigneeId ?? '');
      setLabels(assigned.data); setAvailableLabels(available.data); setSubtasks(children.data);
    } catch (err) { setError(message(err)); }
    if (currentOrg?.id) {
      try {
        const result = await api.get<{ data?: OrgMember[]; members?: OrgMember[] }>(`/api/organizations/${encodeURIComponent(currentOrg.id)}/members`);
        setMembers(Array.isArray(result.data) ? result.data : Array.isArray(result.members) ? result.members : []);
      } catch (err) {
        setMembersError(`Member list unavailable: ${message(err)}. Existing assignment is preserved unless changed.`);
      }
    }
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !title.trim()) return;
    if (startDate && dueDate && startDate > dueDate) {
      setError('Due date must be on or after start date.');
      return;
    }
    setBusy(true); setError('');
    try {
      const originalStatus = selected.status;
      const patch = await api.patch<{ task: Task }>(`/api/tasks/${selected.id}`, {
        title: title.trim(), description: description.trim() || null, priority,
        startDate: isoDate(startDate), dueDate: isoDate(dueDate),
        assigneeId: assigneeId || null,
      });
      let saved = patch.task;
      setSelected(saved);
      if (status !== originalStatus) {
        const destinationIndex = (board.columns[status] ?? []).length;
        await api.patch(`/api/projects/${encodeURIComponent(projectId)}/kanban/move`, {
          taskId: selected.id, status, targetIndex: destinationIndex,
        });
        const latest = await api.get<{ task: Task }>(`/api/tasks/${selected.id}`);
        saved = latest.task;
        setSelected(saved);
      }
      setTitle(saved.title); setDescription(saved.description ?? ''); setPriority(saved.priority);
      setStatus(saved.status); setStartDate(dateValue(saved.startDate));
      setDueDate(dateValue(saved.dueDate)); setAssigneeId(saved.assigneeId ?? '');
      setEditing(false);
      await refresh();
    } catch (err) {
      setError(`${message(err)}. Some changes may have saved; refresh before retrying.`);
      try {
        const latest = await api.get<{ task: Task }>(`/api/tasks/${selected.id}`);
        setSelected(latest.task);
        await refresh();
      } catch { /* Preserve the original error. */ }
    } finally { setBusy(false); }
  };

  const cancelEdit = () => {
    if (!selected) return;
    setTitle(selected.title); setDescription(selected.description ?? '');
    setPriority(selected.priority); setStatus(selected.status);
    setStartDate(dateValue(selected.startDate)); setDueDate(dateValue(selected.dueDate));
    setAssigneeId(selected.assigneeId ?? '');
    setEditing(false); setError('');
  };

  const closeTask = () => {
    if (busy) return;
    if (editing && !window.confirm('Discard unsaved task changes?')) return;
    setEditing(false);
    setSelected(null);
  };

  const archive = async () => {
    if (!selected || !window.confirm('Archive this task?')) return;
    setBusy(true); setError('');
    try {
      await api.post(`/api/tasks/${selected.id}/archive`, {});
      setSelected(null); await refresh();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const assignLabel = async (labelId: string) => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await api.post(`/api/tasks/${selected.id}/labels`, { labelId });
      setLabels((prev) => [...prev, ...availableLabels.filter((label) => label.id === labelId)]);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const removeLabel = async (labelId: string) => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await api.delete(`/api/tasks/${selected.id}/labels/${labelId}`);
      setLabels((prev) => prev.filter((label) => label.id !== labelId));
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const createLabel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newLabel.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await api.post<{ label: Label }>(`/api/projects/${encodeURIComponent(projectId)}/labels`, { name: newLabel.trim() });
      setAvailableLabels((prev) => [...prev, res.label]); setNewLabel('');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const createSubtask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !subtaskTitle.trim()) return;
    setBusy(true); setError('');
    try {
      await api.post(`/api/tasks/${selected.id}/subtasks`, { title: subtaskTitle.trim() });
      const res = await api.get<{ data: Task[] }>(`/api/tasks/${selected.id}/subtasks`);
      setSubtasks(res.data); setSubtaskTitle(''); await refresh();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };

  const onDropColumn = (event: DragEvent<HTMLElement>, destination: Status, targetIndex: number) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/task-id') || draggedId;
    if (id) {
      const origin = statuses.find((column) => (board.columns[column] ?? []).some((task) => task.id === id));
      const limit = (board.columns[destination] ?? []).length;
      const index = origin === destination ? Math.max(0, Math.min(targetIndex, limit - 1)) : targetIndex;
      void move(id, destination, index);
    }
  };

  if (authLoading || !user) return <div className="p-8 text-gray-600">Loading tasks...</div>;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs uppercase font-semibold tracking-wide text-indigo-600">PRD 03 · Task Management</p>
          <h1 className="text-3xl font-bold text-gray-900">Tasks & Kanban</h1>
          <p className="text-sm text-gray-500 mt-1">{currentOrg?.name ?? 'Choose an organization'} · {board.total} active tasks</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || busy || !projectId} className="btn-primary disabled:opacity-50">Refresh board</button>
      </header>

      <form onSubmit={chooseProject} className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className="flex-1 text-sm font-semibold text-gray-700">Project ID
          <input className="input-field mt-1 w-full" value={projectInput} onChange={(e) => setProjectInput(e.target.value)} placeholder="Paste a project ID from your project workspace" aria-label="Project ID" required />
        </label>
        <button className="btn-primary" type="submit">Open project</button>
      </form>
      {!currentOrg && <p className="rounded-lg bg-amber-50 p-4 text-amber-800">Select an organization from the navigation bar before opening a project.</p>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {projectId && currentOrg && <>
        <form onSubmit={createTask} className="card p-4 space-y-3">
          <h2 className="text-lg font-semibold">Create task</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input-field" placeholder="Task title" aria-label="Task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} required />
            <input className="input-field" placeholder="Description (optional)" aria-label="Task description" value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} />
            <select className="input-field" aria-label="New task status" value={newTaskStatus} onChange={(e) => setNewTaskStatus(e.target.value as Status)}>{statuses.map((s) => <option key={s} value={s}>{names[s]}</option>)}</select>
            <select className="input-field" aria-label="New task priority" value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as Priority)}>{(['LOW','MEDIUM','HIGH','URGENT'] as Priority[]).map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <button className="btn-primary" disabled={busy}>Create task</button>
        </form>

        <section aria-label="Kanban board" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statuses.map((column) => <div key={column} className="min-h-[250px] rounded-xl border border-gray-200 bg-gray-50 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropColumn(e, column, (board.columns[column] ?? []).length)}>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-gray-800">{names[column]}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-500">{board.columns[column]?.length ?? 0}</span></div>
            <div className="space-y-2">
              {(board.columns[column] ?? []).map((task, index) => <article key={task.id} draggable={!busy} onDragStart={(event) => { setDraggedId(task.id); event.dataTransfer.setData('text/task-id', task.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); onDropColumn(e, column, index); }} className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md">
                <button type="button" className="w-full text-left font-semibold text-sm text-gray-900" onClick={() => void openTask(task)}>{task.title}</button>
                {task.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{task.description}</p>}
                <div className="mt-3 flex justify-between gap-2 items-center"><span className="text-[11px] font-medium text-indigo-700">{task.priority}</span><span className="text-[11px] text-gray-400">#{task.position + 1}</span></div>
                {task.parentTaskId && <p className="mt-1 text-[11px] text-gray-400">Subtask</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {statuses.filter((s) => s !== column).map((s) => <button key={s} type="button" disabled={busy} onClick={() => void move(task.id, s, (board.columns[s] ?? []).length)} className="rounded bg-gray-100 px-1.5 py-1 text-[10px] text-gray-600 hover:bg-indigo-50" title={`Move to ${names[s]}`}>{names[s]}</button>)}
                </div>
              </article>)}
              {!loading && !(board.columns[column]?.length) && <p className="text-xs text-gray-400 p-3">Drop tasks here</p>}
            </div>
          </div>)}
        </section>
        {loading && <p role="status" className="text-sm text-gray-500">Loading board...</p>}
      </>}

      {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(event) => { if (event.target === event.currentTarget && !editing) closeTask(); }}>
        <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl space-y-5" onClick={(e) => e.stopPropagation()} aria-label="Task details">
          <div className="flex justify-between items-start gap-3"><h2 className="text-xl font-bold text-gray-900">Task details</h2><button className="text-gray-600" type="button" onClick={closeTask}>Close</button></div>
          <form onSubmit={saveTask} className="space-y-3">
            <label className="block text-sm font-medium">Title<input disabled={!editing} className="input-field mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label className="block text-sm font-medium">Description<textarea disabled={!editing} className="input-field mt-1 w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className="block text-sm font-medium">Priority<select disabled={!editing} className="input-field mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{(['LOW','MEDIUM','HIGH','URGENT'] as Priority[]).map((p) => <option key={p}>{p}</option>)}</select></label>
             <label className="block text-sm font-medium">Status
               <select disabled={!editing} className="input-field mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                 {statuses.map((item) => <option key={item} value={item}>{names[item]}</option>)}
               </select>
             </label>
             <label className="block text-sm font-medium">Assignee
               <select disabled={!editing || !!membersError} className="input-field mt-1 w-full" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                 <option value="">Unassigned</option>
                 {assigneeId && !members.some((member) => member.userId === assigneeId) && <option value={assigneeId}>Current assignee ({assigneeId})</option>}
                 {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} ({member.user.email})</option>)}
               </select>
             </label>
             {membersError && <p role="status" className="text-xs text-amber-700">{membersError}</p>}
             <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
               <label className="block text-sm font-medium">Start date
                 <input disabled={!editing} type="date" className="input-field mt-1 w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
               </label>
               <label className="block text-sm font-medium">Due date
                 <input disabled={!editing} type="date" min={startDate || undefined} className="input-field mt-1 w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
               </label>
             </div>
            {editing ? <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button><button type="button" onClick={cancelEdit} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button></div> : <button type="button" onClick={() => setEditing(true)} className="btn-primary">Edit task</button>}
          </form>
          <button type="button" disabled={busy} onClick={() => void archive()} className="text-sm text-red-700 underline">Archive task</button>
          <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Labels</h3>
            <div className="flex flex-wrap gap-2">{labels.map((label) => <button key={label.id} type="button" onClick={() => void removeLabel(label.id)} disabled={busy} className="rounded-full border px-3 py-1 text-xs" title="Remove label"><span style={{ color: label.color }}>●</span> {label.name} ×</button>)}</div>
            <select className="input-field w-full" aria-label="Assign label" defaultValue="" onChange={(e) => { if (e.target.value) void assignLabel(e.target.value); e.target.value = ''; }}><option value="">Assign an existing label…</option>{availableLabels.filter((label) => !labels.some((x) => x.id === label.id)).map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>
            <form onSubmit={createLabel} className="flex gap-2"><input className="input-field flex-1" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New label name" aria-label="New label name" /><button className="btn-primary" disabled={busy}>Create label</button></form>
          </div>
          <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Subtasks</h3>
            {subtasks.map((task) => <p key={task.id} className="rounded bg-gray-50 p-2 text-sm">{task.title} <span className="text-xs text-gray-500">({names[task.status]})</span></p>)}
            <form onSubmit={createSubtask} className="flex gap-2"><input className="input-field flex-1" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Subtask title" aria-label="Subtask title" /><button className="btn-primary" disabled={busy}>Add</button></form>
          </div>
        </aside>
      </div>}
    </main>
  );
}
