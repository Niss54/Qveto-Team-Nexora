'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadUnreadCount = async () => {
    try {
      const data = await api.get<{ unreadCount: number }>('/api/notifications/unread-count');
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Ignore background fetch errors
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ notifications: NotificationItem[] }>('/api/notifications?pageSize=20');
      setNotifications(data.notifications || []);
      // Also update unread count
      const count = (data.notifications || []).filter((n) => !n.isRead).length;
      setUnreadCount(count);
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // 30s background poll
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

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
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/api/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
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
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
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
                className="text-xs text-primary-600 hover:text-primary-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                <span className="text-2xl block mb-1">🎉</span>
                No notifications right now!
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
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
                      onClick={(e) => handleMarkAsRead(item.id, e)}
                      className="text-xs text-gray-400 hover:text-primary-600 flex-shrink-0 pt-0.5"
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
