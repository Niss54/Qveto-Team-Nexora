'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();

  return (
    <main className="flex flex-col items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
          🚀 Team Nexora &middot; Multi-Organization SaaS Foundation
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Modern project management for{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">
            high-velocity teams.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Centralize ownership, priorities, deadlines, and progress with strict server-side tenant
          isolation and granular role-based security.
        </p>

        {/* Call to Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          {loading ? (
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard"
              className="btn-primary text-base py-3 px-6 shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <span>Go to Dashboard</span>
              <span>&rarr;</span>
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="btn-primary text-base py-3 px-6 shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <span>Get Started Free</span>
                <span>&rarr;</span>
              </Link>
              <Link
                href="/login"
                className="btn-secondary text-base py-3 px-6 border border-gray-200 bg-white hover:bg-gray-50"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 text-left">
          <div className="card p-6">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold mb-4">
              🛡️
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Tenant Isolation</h3>
            <p className="text-sm text-gray-600">
              Complete data partitioning. Users in Organization A cannot access or mutate resources
              in Organization B.
            </p>
          </div>

          <div className="card p-6">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold mb-4">
              👑
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Granular RBAC</h3>
            <p className="text-sm text-gray-600">
              Server-enforced roles for Owners, Managers, and Employees with strict safeguards
              against unauthorized operations.
            </p>
          </div>

          <div className="card p-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold mb-4">
              ⚡
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Fast &amp; Modern</h3>
            <p className="text-sm text-gray-600">
              Built with Next.js 14 App Router, TypeScript, Tailwind CSS, Express, and PostgreSQL
              Prisma ORM.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
