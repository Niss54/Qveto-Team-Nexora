'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from './RoleBadge';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const { currentOrg } = useAuth();

  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊' },
    { name: 'Workspaces', href: '/workspaces', icon: '🏢' },
    { name: 'Projects', href: '/projects', icon: '📁' },
    { name: 'Tasks & Kanban', href: '/tasks', icon: '📋' },
    { name: 'Members & Roles', href: '/members', icon: '👥' },
    { name: 'Settings', href: '/settings', icon: '⚙️' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-6">
        {/* Active Organization Info Card */}
        {currentOrg ? (
          <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Active Tenant
              </span>
              {currentOrg.role && <RoleBadge role={currentOrg.role} />}
            </div>
            <p className="font-bold text-gray-900 truncate">{currentOrg.name}</p>
            <p className="text-xs text-gray-400 font-mono">/{currentOrg.slug}</p>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
            ⚠️ No organization selected. Create or switch an organization in the navbar above.
          </div>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
        <p className="font-medium text-gray-600">Qveto Platform v1.0</p>
        <p>Tenant-Scoped SaaS Baseline</p>
      </div>
    </aside>
  );
}
