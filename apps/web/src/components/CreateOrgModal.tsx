'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ApiClientError } from '@/lib/api-client';

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateOrgModal({ isOpen, onClose, onSuccess }: CreateOrgModalProps) {
  const { createOrg } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createOrg({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.error.message || 'Failed to create organization');
      } else {
        setError(err.message || 'An error occurred while creating organization');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Create Organization</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="input-field"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this organization works on"
              rows={3}
              className="input-field resize-none"
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-sm flex items-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Organization'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
