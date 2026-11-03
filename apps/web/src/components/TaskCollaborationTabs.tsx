'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const [submittingComment, setSubmittingComment] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity state
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Load comments
  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const data = await api.get<{ comments: CommentItem[] }>(`/api/tasks/${taskId}/comments`);
      setComments(data.comments || []);
    } catch (err) {
      // Ignore
    } finally {
      setCommentsLoading(false);
    }
  };

  // Load attachments
  const loadAttachments = async () => {
    setAttachmentsLoading(true);
    try {
      const data = await api.get<{ attachments: AttachmentItem[] }>(`/api/tasks/${taskId}/attachments`);
      setAttachments(data.attachments || []);
    } catch (err) {
      // Ignore
    } finally {
      setAttachmentsLoading(false);
    }
  };

  // Load activity
  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      const data = await api.get<{ activity: ActivityItem[] }>(`/api/tasks/${taskId}/activity`);
      setActivity(data.activity || []);
    } catch (err) {
      // Ignore
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'comments') loadComments();
    if (activeTab === 'attachments') loadAttachments();
    if (activeTab === 'activity') loadActivity();
  }, [taskId, activeTab]);

  // Submit comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    setError(null);
    try {
      const res = await api.post<{ comment: CommentItem }>(`/api/tasks/${taskId}/comments`, {
        content: newComment.trim(),
      });
      setComments((prev) => [...prev, res.comment]);
      setNewComment('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to post comment.');
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await api.delete(`/api/tasks/${taskId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      alert('Failed to delete comment.');
    }
  };

  // Upload attachment
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds the 10MB limit.');
      return;
    }

    setUploading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      alert('Failed to delete attachment.');
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
    <div className="border-t border-gray-200 pt-5 mt-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 space-x-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
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
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
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
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'activity'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📜</span> Activity
        </button>
      </div>

      {error && (
        <div className="mt-3 p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* 1. Comments Tab */}
      {activeTab === 'comments' && (
        <div className="mt-4 space-y-4">
          {/* Add comment form */}
          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              className="w-full text-sm rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors"
              rows={2}
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submittingComment}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim()}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>

          {/* Comments list */}
          {commentsLoading ? (
            <div className="text-center py-4 text-xs text-gray-400">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400">No comments yet. Start the conversation!</div>
          ) : (
            <div className="space-y-3 pt-2">
              {comments.map((comment) => (
                <div key={comment.id} className="p-3 bg-gray-50/75 rounded-lg border border-gray-100 space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold text-gray-900">{comment.author?.name || 'User'}</span>
                    <div className="flex items-center gap-2">
                      <span>{timeAgo(comment.createdAt)}</span>
                      {user?.id === comment.authorId && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete comment"
                        >
                          🗑️
                        </button>
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
        <div className="mt-4 space-y-4">
          {/* Upload trigger */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div>
              <p className="text-xs font-medium text-gray-800">Attach files to this task</p>
              <p className="text-[11px] text-gray-400">PDF, PNG, JPG, Word, Excel, CSV (Max 10MB)</p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id="file-upload-input"
              />
              <label
                htmlFor="file-upload-input"
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
            <div className="text-center py-4 text-xs text-gray-400">Loading attachments...</div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400">No attachments uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
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
                      onClick={() => handleDownloadAttachment(file.id, file.fileName)}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 font-medium hover:bg-primary-50 rounded"
                    >
                      Download
                    </button>
                    {(user?.id === file.uploadedById || user) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(file.id)}
                        className="text-gray-400 hover:text-red-600 px-1 py-1"
                        title="Delete file"
                      >
                        ✕
                      </button>
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
        <div className="mt-4">
          {activityLoading ? (
            <div className="text-center py-4 text-xs text-gray-400">Loading activity...</div>
          ) : activity.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400">No activity recorded for this task yet.</div>
          ) : (
            <div className="space-y-3 pl-2 border-l-2 border-gray-100">
              {activity.map((event) => (
                <div key={event.id} className="relative pl-3 text-xs">
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
