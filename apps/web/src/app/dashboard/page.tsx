'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from '@/components/RoleBadge';
import { CreateOrgModal } from '@/components/CreateOrgModal';
import { api, ApiClientError } from '@/lib/api-client';
import type { OrgMemberResponse } from '@qveto/shared';

export default function DashboardPage() {
  const router = useRouter();
  const { user, currentOrg, organizations, loading: authLoading } = useAuth();

  const [members, setMembers] = useState<OrgMemberResponse[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Add Member state (for OWNER)
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'EMPLOYEE' | 'MANAGER' | 'OWNER'>('EMPLOYEE');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  // Route protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch organization members when currentOrg changes
  const fetchMembers = useCallback(async () => {
    if (!currentOrg) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const res = await api.get<{ members: OrgMemberResponse[] }>(
        `/api/organizations/${currentOrg.id}/members`,
      );
      setMembers(res.members);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (currentOrg) {
      fetchMembers();
    }
  }, [currentOrg, fetchMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !newMemberEmail.trim()) return;

    setAddingMember(true);
    setMemberError(null);
    setMemberSuccess(null);

    try {
      await api.post(`/api/organizations/${currentOrg.id}/members`, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
      setMemberSuccess(`Successfully added ${newMemberEmail} as ${newMemberRole}.`);
      setNewMemberEmail('');
      await fetchMembers();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setMemberError(err.error.message || 'Failed to add member.');
      } else {
        setMemberError(err.message || 'An error occurred.');
      }
    } finally {
      setAddingMember(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome & Overview Header */}
      <div className="bg-gradient-to-r from-primary-900 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-200">
            Platform Dashboard
          </span>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Welcome back, {user.name}! 👋</h1>
          <p className="text-primary-100 text-sm mt-2">
            Secure multi-organization collaboration baseline. All actions and resources are scoped
            to your active tenant.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {currentOrg ? (
              <>
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-lg border border-white/20 text-sm">
                  <span>🏢 Active Org:</span>
                  <span className="font-semibold">{currentOrg.name}</span>
                </div>
                {currentOrg.role && <RoleBadge role={currentOrg.role} />}
              </>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className="btn-primary text-xs bg-white text-primary-900 hover:bg-gray-100 font-semibold"
              >
                + Create Your First Organization
              </button>
            )}
          </div>
        </div>
      </div>

      {currentOrg ? (
        <>
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Organization Role
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xl font-bold text-gray-900">
                  {currentOrg.role || 'MEMBER'}
                </span>
                {currentOrg.role && <RoleBadge role={currentOrg.role} />}
              </div>
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Members
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {currentOrg.memberCount ?? members.length}
              </p>
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Tenant Isolation
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-semibold text-green-700">Server-Enforced</span>
              </div>
            </div>

            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Tenant Slug
              </p>
              <p className="text-sm font-mono text-gray-700 mt-2 truncate bg-gray-50 p-1.5 rounded border border-gray-100">
                /{currentOrg.slug}
              </p>
            </div>
          </div>

          {/* Members List & Invitation Card */}
          <div className="card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Organization Members</h2>
                <p className="text-xs text-gray-500">
                  All active team members registered under {currentOrg.name}.
                </p>
              </div>

              {currentOrg.role === 'OWNER' && (
                <div className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200">
                  ✨ As OWNER, you can invite and manage members.
                </div>
              )}
            </div>

            {/* Invite Member Form (OWNER only) */}
            {currentOrg.role === 'OWNER' && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-2">Invite a Member</h3>
                {memberError && (
                  <p className="mb-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    {memberError}
                  </p>
                )}
                {memberSuccess && (
                  <p className="mb-3 text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                    {memberSuccess}
                  </p>
                )}

                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="User's registered email"
                    className="input-field text-sm flex-1"
                    required
                    disabled={addingMember}
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as any)}
                    className="input-field text-sm sm:w-40"
                    disabled={addingMember}
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                  <button
                    type="submit"
                    className="btn-primary text-sm whitespace-nowrap"
                    disabled={addingMember}
                  >
                    {addingMember ? 'Adding...' : 'Add Member'}
                  </button>
                </form>
              </div>
            )}

            {/* Members Table */}
            {loadingMembers ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No members found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-900 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 font-bold text-xs flex items-center justify-center">
                            {member.user.name.charAt(0).toUpperCase()}
                          </span>
                          <span>{member.user.name}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-500">{member.user.email}</td>
                        <td className="py-3 px-4">
                          <RoleBadge role={member.role} />
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="card text-center py-16 px-4">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
            🏢
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Organization Selected</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-2">
            You don&apos;t have an active organization selected. You can create a new organization
            to start collaborating.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-6 btn-primary text-sm inline-flex items-center gap-2"
          >
            + Create New Organization
          </button>
        </div>
      )}

      <CreateOrgModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
