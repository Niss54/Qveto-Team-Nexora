'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api-client';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

const NOTIFICATION_SYNC_CHANNEL = 'qveto_notifications_sync';
const NOTIFICATION_STORAGE_KEY = 'qveto_notif_sync_ts';

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

function getIcon(type: string): string {
  switch (type) {
    case 'TASK_ASSIGNED':
      return '📋';
    case 'TASK_OVERDUE':
      return '⚠️';
    case 'COMMENT_ADDED':
      return '💬';
    case 'TASK_STATUS_CHANGED':
      return '🔄';
    case 'TASK_DUE_DATE_CHANGED':
      return '📅';
    default:
      return '🔔';
  }
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Broadcast sync event to all other open tabs
  const broadcastSync = useCallback((newCount?: number) => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
        channel.postMessage({ type: 'BADGE_UPDATED', unreadCount: newCount });
        channel.close();
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, Date.now().toString());
      }
    } catch {
      // Ignore broadcast channel errors in restricted environments
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await api.get<{ unreadCount: number }>('/api/notifications/unread-count');
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Ignore background fetch errors
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ notifications: NotificationItem[] }>('/api/notifications?pageSize=20');
      setNotifications(data.notifications || []);
      const count = (data.notifications || []).filter((n) => !n.isRead).length;
      setUnreadCount(count);
    } catch {
      setError('Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and periodic polling
  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // 30s background poll
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Load list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  // Cross-Tab Synchronization (BroadcastChannel + localStorage storage event + visibilitychange)
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
        channel.onmessage = (event) => {
          if (event.data?.type === 'BADGE_UPDATED') {
            if (typeof event.data.unreadCount === 'number') {
              setUnreadCount(event.data.unreadCount);
            } else {
              loadUnreadCount();
            }
            if (isOpen) {
              loadNotifications();
            }
          }
        };
      }
    } catch {
      // BroadcastChannel unsupported
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_STORAGE_KEY) {
        loadUnreadCount();
        if (isOpen) {
          loadNotifications();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, loadNotifications, loadUnreadCount]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/api/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      const nextCount = Math.max(0, unreadCount - 1);
      setUnreadCount(nextCount);
      broadcastSync(nextCount);
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/api/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      broadcastSync(0);
    } catch {
      // Ignore error
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label="View notifications"
        data-testid="notification-bell-btn"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full shadow-sm animate-pulse"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
          data-testid="notification-dropdown"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 font-medium rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs text-primary-600 hover:text-primary-800 font-medium cursor-pointer"
                data-testid="mark-all-read-btn"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="p-4 space-y-3 animate-pulse" data-testid="notifications-loading">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/4 bg-gray-200 rounded" />
                    <div className="h-2.5 w-1/2 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-2/3 bg-gray-200 rounded" />
                    <div className="h-2.5 w-1/3 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-xs text-red-600">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="mt-2 px-2.5 py-1 text-xs bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400" data-testid="notifications-empty">
                <span className="text-2xl block mb-1">🎉</span>
                <p className="font-medium text-gray-600">All caught up!</p>
                <p className="text-xs text-gray-400 mt-0.5">No notifications right now.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  data-testid={`notification-item-${item.id}`}
                  className={`p-3 transition-colors flex items-start gap-3 ${
                    item.isRead ? 'bg-white hover:bg-gray-50' : 'bg-primary-50/50 hover:bg-primary-50'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{getIcon(item.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-gray-900 truncate">{item.title}</p>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{item.message}</p>
                  </div>
                  {!item.isRead && (
                    <button
                      type="button"
                      title="Mark as read"
                      aria-label="Mark as read"
                      data-testid={`mark-read-${item.id}`}
                      onClick={(e) => handleMarkAsRead(item.id, e)}
                      className="text-xs text-gray-400 hover:text-primary-600 flex-shrink-0 pt-0.5 cursor-pointer px-1 py-0.5"
                    >
                      ✓
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
