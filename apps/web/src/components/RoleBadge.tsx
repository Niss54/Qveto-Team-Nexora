import React from 'react';
import type { OrgRole } from '@qveto/shared';

interface RoleBadgeProps {
  role: OrgRole | string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const normalized = role?.toUpperCase();

  switch (normalized) {
    case 'OWNER':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          👑 OWNER
        </span>
      );
    case 'MANAGER':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          💼 MANAGER
        </span>
      );
    case 'EMPLOYEE':
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          👤 EMPLOYEE
        </span>
      );
  }
}
