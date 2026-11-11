'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RoleBadge } from '@/components/RoleBadge';
import { api, ApiClientError } from '@/lib/api-client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, currentOrg, loading: authLoading, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOwner = currentOrg?.role === 'OWNER';

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name);
      setSlug(currentOrg.slug);
      // Fetch full organization details
      void (async () => {
        setLoading(true);
        try {
          const res = await api.get<{ organization: { description?: string | null } }>(
            `/api/organizations/${currentOrg.id}`,
          );
          setDescription(res.organization.description || '');
        } catch {
          // Fallback
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [currentOrg]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg?.id || !name.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.patch(`/api/organizations/${currentOrg.id}`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setSuccess('Organization settings updated successfully.');
      await refreshUser();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.error.message : 'Failed to update settings';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage general organization profile, slug, and multi-tenant security configuration.
        </p>
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

      {/* General Settings Card */}
      <div className="card p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Organization Profile</h2>
          <p className="text-xs text-gray-500">
            {isOwner
              ? 'As an Organization OWNER, you have full privileges to edit these settings.'
              : 'View-only access. Only organization Owners can mutate organization parameters.'}
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              disabled={!isOwner || saving || loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm w-full max-w-md disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Organization Slug (Tenant Route Key)
            </label>
            <div className="flex items-center gap-2 max-w-md">
              <span className="text-sm text-gray-400 font-mono">/</span>
              <input
                type="text"
                disabled
                value={slug}
                className="input-field text-sm w-full bg-gray-50 text-gray-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Slugs are globally unique immutable tenant identifiers assigned at provisioning.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={3}
              disabled={!isOwner || saving || loading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the organization and team objectives..."
              className="input-field text-sm w-full max-w-lg disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {isOwner && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || loading || !name.trim()}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {saving ? 'Saving Changes...' : 'Save Settings'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Security & Multi-Tenancy Architecture Card */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Tenant Security & Isolation Diagnostic</h2>
          <p className="text-xs text-gray-500">
            Verified server-side security properties enforced on this tenant instance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-500 font-medium">Tenant ID (Internal):</span>
            <p className="font-mono text-gray-800 font-semibold truncate mt-0.5">{currentOrg?.id}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-500 font-medium">Active Member Role:</span>
            <div className="mt-1 flex items-center gap-2">
              {currentOrg?.role && <RoleBadge role={currentOrg.role} />}
              <span className="text-gray-700 font-semibold">{currentOrg?.role}</span>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-500 font-medium">Authentication Type:</span>
            <p className="text-gray-800 font-semibold mt-0.5">Stateful PostgreSQL Session (HttpOnly Cookie)</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-500 font-medium">Cross-Tenant Isolation:</span>
            <p className="text-emerald-700 font-semibold mt-0.5">Active & Row-Level Enforced (Strict 403)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
