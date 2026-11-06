'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

interface CommentItem {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
}

interface AttachmentItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  taskId: string;
  uploadedById: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

interface ActivityItem {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  actorId: string;
  orgId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSec < 60) return 'Just now';
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function formatActivityType(type: string, metadata?: Record<string, unknown> | null): string {
  switch (type) {
    case 'TASK_CREATED':
      return 'created this task';
    case 'TASK_STATUS_CHANGED':
      return `changed status to ${metadata?.toStatus || 'updated'}`;
    case 'TASK_ASSIGNED':
      return 'changed task assignment';
    case 'TASK_DUE_DATE_CHANGED':
      return 'updated the due date';
    case 'COMMENT_ADDED':
      return 'added a comment';
    case 'COMMENT_DELETED':
      return 'deleted a comment';
    case 'ATTACHMENT_UPLOADED':
      return `uploaded file "${metadata?.fileName || 'attachment'}"`;
    case 'ATTACHMENT_DELETED':
      return `deleted file "${metadata?.fileName || 'attachment'}"`;
    case 'TASK_ARCHIVED':
      return 'archived the task';
    case 'TASK_DELETED':
      return 'deleted this task';
    default:
      return type.toLowerCase().replace(/_/g, ' ');
  }
}

export function TaskCollaborationTabs({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'comments' | 'attachments' | 'activity'>('comments');

  // Comments state
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteAttachmentId, setConfirmDeleteAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity state
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  // General error banner
  const [actionError, setActionError] = useState<string | null>(null);

  // Load comments
  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const data = await api.get<{ comments: CommentItem[] }>(`/api/tasks/${taskId}/comments`);
      setComments(data.comments || []);
    } catch {
      setCommentsError('Failed to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  }, [taskId]);

  // Load attachments
  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const data = await api.get<{ attachments: AttachmentItem[] }>(`/api/tasks/${taskId}/attachments`);
      setAttachments(data.attachments || []);
    } catch {
      setAttachmentsError('Failed to load attachments.');
    } finally {
      setAttachmentsLoading(false);
    }
  }, [taskId]);

  // Load activity
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const data = await api.get<{ activity: ActivityItem[] }>(`/api/tasks/${taskId}/activity`);
      setActivity(data.activity || []);
    } catch {
      setActivityError('Failed to load activity log.');
    } finally {
      setActivityLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (activeTab === 'comments') loadComments();
    if (activeTab === 'attachments') loadAttachments();
    if (activeTab === 'activity') loadActivity();
  }, [taskId, activeTab, loadComments, loadAttachments, loadActivity]);

  // Submit comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    setActionError(null);
    try {
      const res = await api.post<{ comment: CommentItem }>(`/api/tasks/${taskId}/comments`, {
        content: newComment.trim(),
      });
      setComments((prev) => [...prev, res.comment]);
      setNewComment('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.error.message);
      } else {
        setActionError('Failed to post comment.');
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    setActionError(null);
    try {
      await api.delete(`/api/tasks/${taskId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setConfirmDeleteCommentId(null);
    } catch {
      setActionError('Failed to delete comment.');
    }
  };

  // Upload attachment
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setActionError('File size exceeds the 10MB limit (max 10MB allowed).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson?.error?.message || 'File upload failed');
      }

      const json = await res.json();
      setAttachments((prev) => [json.attachment, ...prev]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId: string) => {
    setActionError(null);
    try {
      await api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      setConfirmDeleteAttachmentId(null);
    } catch {
      setActionError('Failed to delete attachment.');
    }
  };

  // Download attachment
  const handleDownloadAttachment = (attachmentId: string, fileName: string) => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const downloadUrl = `${API_BASE}/api/tasks/${taskId}/attachments/${attachmentId}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border-t border-gray-200 pt-5 mt-6" data-testid="task-collaboration-tabs">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 space-x-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          data-testid="tab-comments"
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'comments'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>💬</span> Comments {comments.length > 0 && `(${comments.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attachments')}
          data-testid="tab-attachments"
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'attachments'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📎</span> Attachments {attachments.length > 0 && `(${attachments.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          data-testid="tab-activity"
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'activity'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📜</span> Activity
        </button>
      </div>

      {/* Dismissible Error Banner */}
      {actionError && (
        <div className="mt-3 p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between" data-testid="collab-error-banner">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-800 ml-2 font-bold"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Comments Tab */}
      {activeTab === 'comments' && (
        <div className="mt-4 space-y-4" data-testid="comments-tab-content">
          {/* Add comment form */}
          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              className="w-full text-sm rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
              rows={2}
              placeholder="Write a comment..."
              aria-label="Write a comment"
              data-testid="comment-textarea"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submittingComment}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim()}
                data-testid="post-comment-btn"
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>

          {/* Comments list */}
          {commentsLoading ? (
            <div className="space-y-3 pt-2 animate-pulse" data-testid="comments-loading">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                  <div className="h-2.5 w-12 bg-gray-200 rounded" />
                </div>
                <div className="h-3 w-3/4 bg-gray-200 rounded" />
              </div>
            </div>
          ) : commentsError ? (
            <div className="text-center py-6 px-4 bg-red-50/50 rounded-xl border border-red-100">
              <p className="text-xs text-red-600 mb-2">{commentsError}</p>
              <button
                type="button"
                onClick={loadComments}
                className="px-3 py-1 text-xs bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200" data-testid="comments-empty">
              <span className="text-2xl block mb-2">💬</span>
              <p className="text-xs font-semibold text-gray-700">No comments yet</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Start the conversation with your team by leaving a comment above.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  data-testid={`comment-item-${comment.id}`}
                  className="p-3 bg-gray-50/75 rounded-lg border border-gray-100 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold text-gray-900">{comment.author?.name || 'User'}</span>
                    <div className="flex items-center gap-2">
                      <span>{timeAgo(comment.createdAt)}</span>
                      {user?.id === comment.authorId && (
                        confirmDeleteCommentId === comment.id ? (
                          <div className="flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded text-[11px]">
                            <span className="text-red-700">Delete?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-red-600 font-bold hover:underline cursor-pointer"
                              data-testid={`confirm-delete-comment-${comment.id}`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommentId(null)}
                              className="text-gray-500 hover:underline cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCommentId(comment.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Delete comment"
                            aria-label="Delete comment"
                            data-testid={`delete-comment-btn-${comment.id}`}
                          >
                            🗑️
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Attachments Tab */}
      {activeTab === 'attachments' && (
        <div className="mt-4 space-y-4" data-testid="attachments-tab-content">
          {/* Upload trigger */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div>
              <p className="text-xs font-medium text-gray-800">Attach files to this task</p>
              <p className="text-[11px] text-gray-400">PDF, PNG, JPG, Word, Excel, CSV, TXT (Max 10MB)</p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id="file-upload-input"
                data-testid="file-upload-input"
              />
              <label
                htmlFor="file-upload-input"
                data-testid="upload-file-btn"
                className={`px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg cursor-pointer transition-colors ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </label>
            </div>
          </div>

          {/* Attachments list */}
          {attachmentsLoading ? (
            <div className="space-y-2 animate-pulse" data-testid="attachments-loading">
              <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 bg-gray-200 rounded" />
                  <div className="space-y-1">
                    <div className="h-3 w-32 bg-gray-200 rounded" />
                    <div className="h-2 w-16 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            </div>
          ) : attachmentsError ? (
            <div className="text-center py-6 px-4 bg-red-50/50 rounded-xl border border-red-100">
              <p className="text-xs text-red-600 mb-2">{attachmentsError}</p>
              <button
                type="button"
                onClick={loadAttachments}
                className="px-3 py-1 text-xs bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200" data-testid="attachments-empty">
              <span className="text-2xl block mb-2">📎</span>
              <p className="text-xs font-semibold text-gray-700">No attachments uploaded yet</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Files uploaded to this task will be safely kept and accessible here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  data-testid={`attachment-item-${file.id}`}
                  className="p-2.5 bg-white rounded-lg border border-gray-200 flex items-center justify-between text-xs hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base">📄</span>
                    <div className="truncate">
                      <p className="font-medium text-gray-900 truncate">{file.fileName}</p>
                      <p className="text-[10px] text-gray-400">
                        {formatBytes(file.fileSize)} • by {file.uploadedBy?.name || 'User'} • {timeAgo(file.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`download-attachment-${file.id}`}
                      onClick={() => handleDownloadAttachment(file.id, file.fileName)}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 font-medium hover:bg-primary-50 rounded cursor-pointer"
                    >
                      Download
                    </button>
                    {(user?.id === file.uploadedById || user) && (
                      confirmDeleteAttachmentId === file.id ? (
                        <div className="flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded text-[11px]">
                          <span className="text-red-700">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(file.id)}
                            className="text-red-600 font-bold hover:underline cursor-pointer"
                            data-testid={`confirm-delete-attachment-${file.id}`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAttachmentId(null)}
                            className="text-gray-500 hover:underline cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAttachmentId(file.id)}
                          className="text-gray-400 hover:text-red-600 px-1 py-1 cursor-pointer"
                          title="Delete file"
                          aria-label="Delete file"
                          data-testid={`delete-attachment-btn-${file.id}`}
                        >
                          ✕
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Activity Tab */}
      {activeTab === 'activity' && (
        <div className="mt-4" data-testid="activity-tab-content">
          {activityLoading ? (
            <div className="space-y-3 pl-2 animate-pulse" data-testid="activity-loading">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                <div className="h-3 w-48 bg-gray-200 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                <div className="h-3 w-36 bg-gray-200 rounded" />
              </div>
            </div>
          ) : activityError ? (
            <div className="text-center py-6 px-4 bg-red-50/50 rounded-xl border border-red-100">
              <p className="text-xs text-red-600 mb-2">{activityError}</p>
              <button
                type="button"
                onClick={loadActivity}
                className="px-3 py-1 text-xs bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-8 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200" data-testid="activity-empty">
              <span className="text-2xl block mb-2">📜</span>
              <p className="text-xs font-semibold text-gray-700">No activity recorded yet</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Task updates, comments, and attachments will show up here chronologically.</p>
            </div>
          ) : (
            <div className="space-y-3 pl-2 border-l-2 border-gray-100">
              {activity.map((event) => (
                <div key={event.id} data-testid={`activity-item-${event.id}`} className="relative pl-3 text-xs">
                  <span className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-primary-400 ring-4 ring-white" />
                  <p className="text-gray-800 leading-relaxed">
                    <span className="font-semibold text-gray-900">{event.actor?.name || 'Someone'}</span>{' '}
                    {formatActivityType(event.type, event.metadata)}
                  </p>
                  <span className="text-[10px] text-gray-400">{timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
