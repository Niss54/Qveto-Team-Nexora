'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from '@/components/RoleBadge';
import { api, ApiClientError } from '@/lib/api-client';
import type { OrgMemberResponse, OrgRole } from '@qveto/shared';

export default function MembersPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading } = useAuth();

  const [members, setMembers] = useState<OrgMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EMPLOYEE' | 'MANAGER' | 'OWNER'>('EMPLOYEE');
  const [inviting, setInviting] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Updating role / removing member
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const isOwner = currentOrg?.role === 'OWNER';
  const isManager = currentOrg?.role === 'MANAGER';
  const canManageMembers = isOwner;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ members: OrgMemberResponse[] }>(
        `/api/organizations/${currentOrg.id}/members`,
      );
      setMembers(res.members);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.error.message : 'Failed to load members';
      setError(msg);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    if (currentOrg?.id) {
      void fetchMembers();
    }
  }, [currentOrg?.id, fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg?.id || !inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post(`/api/organizations/${currentOrg.id}/members`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setSuccess(`Member "${inviteEmail}" has been invited successfully.`);
      setInviteEmail('');
      setInviteRole('EMPLOYEE');
      setInviteModalOpen(false);
      await fetchMembers();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.error.message : 'Failed to add member';
      setError(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: OrgRole) => {
    if (!currentOrg?.id) return;
    setBusyMemberId(targetUserId);
    setError(null);
    setSuccess(null);

    try {
      await api.patch(`/api/organizations/${currentOrg.id}/members/${targetUserId}`, {
        role: newRole,
      });
      setSuccess('Member role updated successfully.');
      await fetchMembers();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.error.message : 'Failed to update member role';
      setError(msg);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemoveMember = async (targetUserId: string, memberName: string) => {
    if (!currentOrg?.id) return;
    if (!confirm(`Are you sure you want to remove ${memberName} from ${currentOrg.name}?`)) {
      return;
    }

    setBusyMemberId(targetUserId);
    setError(null);
    setSuccess(null);

    try {
      await api.delete(`/api/organizations/${currentOrg.id}/members/${targetUserId}`);
      setSuccess(`Member ${memberName} removed from organization.`);
      await fetchMembers();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.error.message : 'Failed to remove member';
      setError(msg);
    } finally {
      setBusyMemberId(null);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Members & Roles</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage team members and permission hierarchy for{' '}
            <span className="font-semibold text-gray-700">{currentOrg?.name}</span>.
          </p>
        </div>

        {canManageMembers && (
          <button
            onClick={() => {
              setError(null);
              setSuccess(null);
              setInviteModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2 self-start sm:self-auto text-sm"
          >
            <span>+</span> Invite Member
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-start justify-between">
          <span>✓ {success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Members</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{members.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Organization Role</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xl font-bold text-gray-900">{currentOrg?.role}</span>
            {currentOrg?.role && <RoleBadge role={currentOrg.role} />}
          </div>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Administrative Access</p>
          <p className="mt-2 text-sm font-medium text-gray-700">
            {canManageMembers ? 'Full Member & Role Administration' : 'View-Only Directory Access'}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search member by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field text-sm w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Filter Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="input-field text-sm"
          >
            <option value="ALL">All Roles</option>
            <option value="OWNER">Owner</option>
            <option value="MANAGER">Manager</option>
            <option value="EMPLOYEE">Employee</option>
          </select>
        </div>
      </div>

      {/* Members Directory Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading members...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-gray-900">No members match your criteria</p>
            <p className="text-xs text-gray-500 mt-1">Try modifying your search query or role filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Joined Date</th>
                  {canManageMembers && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredMembers.map((member) => {
                  const isCurrentLoggedUser = member.userId === user?.id;
                  const isBusy = busyMemberId === member.userId;

                  return (
                    <tr key={member.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-sm">
                            {member.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                              {member.user.name}
                              {isCurrentLoggedUser && (
                                <span className="text-[10px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{member.user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {canManageMembers && !isCurrentLoggedUser ? (
                          <select
                            value={member.role}
                            disabled={isBusy}
                            onChange={(e) =>
                              handleRoleChange(member.userId, e.target.value as OrgRole)
                            }
                            className="text-xs font-semibold rounded-md border border-gray-200 bg-white px-2 py-1 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                          >
                            <option value="EMPLOYEE">Employee</option>
                            <option value="MANAGER">Manager</option>
                            <option value="OWNER">Owner</option>
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {new Date(member.joinedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {canManageMembers && (
                        <td className="py-3.5 px-4 text-right">
                          {!isCurrentLoggedUser && (
                            <button
                              onClick={() => handleRemoveMember(member.userId, member.user.name)}
                              disabled={isBusy}
                              className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline disabled:opacity-50"
                            >
                              {isBusy ? 'Processing...' : 'Remove'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Invite New Member</h3>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input-field text-sm w-full"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  User must already be registered in the platform or will be added on creation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Assigned Organization Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as 'EMPLOYEE' | 'MANAGER' | 'OWNER')
                  }
                  className="input-field text-sm w-full"
                >
                  <option value="EMPLOYEE">Employee (Task collaboration & updates)</option>
                  <option value="MANAGER">Manager (Workspace & project management)</option>
                  <option value="OWNER">Owner (Full administrative control)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {inviting ? 'Inviting...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
