'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiCall } from '@/lib/api';
import { AUTH_CHANGED_EVENT, clearTokens, getAccessToken } from '@/lib/auth';

type MeUser = {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
  role?: string;
};

type MeResponse = { ok: boolean; user: MeUser };

type AuthContextValue = {
  user: MeUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiCall<MeResponse>('/api/identity/secure/users/me', { method: 'GET' }, true);
      setUser(me.user ?? null);
    } catch {
      setUser(null);
      clearTokens();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshUser();
    }, 0);

    const onAuthChanged = () => {
      setLoading(true);
      void refreshUser();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [refreshUser]);

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user && !!getAccessToken(), refreshUser, signOut }),
    [user, loading, refreshUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
