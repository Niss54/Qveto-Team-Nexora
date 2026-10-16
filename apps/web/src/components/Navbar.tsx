'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from './RoleBadge';
import { CreateOrgModal } from './CreateOrgModal';

export function Navbar() {
  const router = useRouter();
  const { user, currentOrg, organizations, switchOrg, logout, loading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand & Org Switcher */}
            <div className="flex items-center gap-6">
              <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  Q
                </span>
                <span className="font-bold text-xl text-gray-900 tracking-tight">Qveto</span>
              </Link>

              {user && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="max-w-[140px] truncate">
                      {currentOrg ? currentOrg.name : 'Select Organization'}
                    </span>
                    {currentOrg?.role && <RoleBadge role={currentOrg.role} />}
                    <span className="text-gray-400 text-xs">▼</span>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Organizations ({organizations.length})
                      </div>

                      <div className="max-h-60 overflow-y-auto">
                        {organizations.map((org) => (
                          <button
                            key={org.id}
                            onClick={() => {
                              switchOrg(org.id);
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${
                              currentOrg?.id === org.id
                                ? 'bg-primary-50 text-primary-900 font-medium'
                                : 'text-gray-700'
                            }`}
                          >
                            <span className="truncate">{org.name}</span>
                            {org.role && <RoleBadge role={org.role} />}
                          </button>
                        ))}

                        {organizations.length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-500 italic">
                            No organizations found
                          </div>
                        )}
                      </div>

                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            setModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 font-medium flex items-center gap-2 transition-colors"
                        >
                          <span>+</span> Create New Organization
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Auth State / User Profile */}
            <div className="flex items-center gap-4">
              {loading ? (
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-gray-900 leading-none">{user.name}</p>
                    <p className="text-xs text-gray-500 leading-tight mt-0.5">{user.email}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm border border-primary-200 shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <button onClick={handleLogout} className="btn-secondary text-xs py-1.5 px-3 ml-1">
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login" className="btn-secondary text-sm">
                    Sign In
                  </Link>
                  <Link href="/register" className="btn-primary text-sm">
                    Create Account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <CreateOrgModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
