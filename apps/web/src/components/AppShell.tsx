'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from './Sidebar';

const PUBLIC_ROUTES = ['/', '/login', '/register'];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // For public routes or unauthenticated states, render without sidebar
  if (isPublicRoute || !user) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex flex-1 min-h-[calc(100vh-4rem)]">
      {/* Desktop Sidebar (hidden on mobile via Tailwind md:flex) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
        {/* Mobile Navigation Strip (visible on mobile only) */}
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden flex items-center gap-2 overflow-x-auto px-4 py-2.5 bg-white border-b border-gray-200 text-xs font-medium"
        >
          <Link
            href="/dashboard"
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              pathname === '/dashboard'
                ? 'bg-primary-50 text-primary-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>📊</span> Dashboard
          </Link>
          <Link
            href="/workspaces"
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              pathname.startsWith('/workspaces')
                ? 'bg-primary-50 text-primary-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>🏢</span> Workspaces
          </Link>
          <Link
            href="/tasks"
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              pathname === '/tasks'
                ? 'bg-primary-50 text-primary-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>📋</span> Tasks
          </Link>
        </nav>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
