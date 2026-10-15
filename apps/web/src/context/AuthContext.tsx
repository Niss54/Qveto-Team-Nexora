'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  UserResponse,
  OrganizationResponse,
  LoginInput,
  RegisterInput,
  CreateOrgInput,
} from '@qveto/shared';
import { api, ApiClientError } from '@/lib/api-client';

interface AuthContextType {
  user: UserResponse | null;
  loading: boolean;
  organizations: OrganizationResponse[];
  currentOrg: OrganizationResponse | null;
  setCurrentOrg: (org: OrganizationResponse | null) => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  createOrg: (input: CreateOrgInput) => Promise<OrganizationResponse>;
  switchOrg: (orgId: string) => void;
  refreshUser: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrganizationResponse | null>(null);

  const refreshOrgs = useCallback(async () => {
    try {
      const res = await api.get<{ organizations: OrganizationResponse[] }>('/api/organizations');
      setOrganizations(res.organizations);

      // Preserve existing currentOrg or select first
      if (res.organizations.length > 0) {
        setCurrentOrg((prev) => {
          if (prev && res.organizations.some((o) => o.id === prev.id)) {
            return res.organizations.find((o) => o.id === prev.id) || prev;
          }
          return res.organizations[0];
        });
      } else {
        setCurrentOrg(null);
      }
    } catch {
      setOrganizations([]);
      setCurrentOrg(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: UserResponse }>('/api/auth/me');
      setUser(res.user);
      await refreshOrgs();
    } catch (err) {
      setUser(null);
      setOrganizations([]);
      setCurrentOrg(null);
    } finally {
      setLoading(false);
    }
  }, [refreshOrgs]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (input: LoginInput) => {
    const res = await api.post<{ user: UserResponse }>('/api/auth/login', input);
    setUser(res.user);
    await refreshOrgs();
  };

  const register = async (input: RegisterInput) => {
    const res = await api.post<{ user: UserResponse }>('/api/auth/register', input);
    setUser(res.user);
    await refreshOrgs();
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // Continue even if server-side logout fails
    } finally {
      setUser(null);
      setOrganizations([]);
      setCurrentOrg(null);
    }
  };

  const createOrg = async (input: CreateOrgInput): Promise<OrganizationResponse> => {
    const res = await api.post<{ organization: OrganizationResponse }>('/api/organizations', input);
    await refreshOrgs();
    setCurrentOrg(res.organization);
    return res.organization;
  };

  const switchOrg = (orgId: string) => {
    const found = organizations.find((o) => o.id === orgId);
    if (found) {
      setCurrentOrg(found);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        organizations,
        currentOrg,
        setCurrentOrg,
        login,
        register,
        logout,
        createOrg,
        switchOrg,
        refreshUser,
        refreshOrgs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
