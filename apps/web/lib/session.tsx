'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post } from './api';
import { useLang } from './i18n';

export interface Me {
  id: string;
  phone: string;
  displayName: string;
  language: 'en' | 'am';
  roles: string[];
  status: string;
  identityStatus: string;
  identityMasked?: string | null;
  verifiedName?: string | null;
  mfa: boolean;
  [k: string]: any;
}

export const STAFF_ROLES = ['VETTING_OFFICER', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'PARTNER_VIEWER'];

interface SessionCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
  has: (...roles: string[]) => boolean;
  isStaff: boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useLang();

  const refresh = useCallback(async () => {
    try {
      const u = await get<Me>('/auth/me');
      setMe(u);
      return u;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().then((u) => {
      if (u?.language) setLang(u.language);
    });
  }, [refresh, setLang]);

  const logout = useCallback(async () => {
    await post('/auth/logout');
    setMe(null);
    window.location.href = '/';
  }, []);

  const has = useCallback((...roles: string[]) => !!me?.roles.some((r) => roles.includes(r)), [me]);
  const isStaff = !!me?.roles.some((r) => STAFF_ROLES.includes(r));

  return <Ctx.Provider value={{ me, loading, refresh, logout, has, isStaff }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
