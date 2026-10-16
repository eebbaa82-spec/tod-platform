'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'am';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  // Inline bilingual text: t('Sign in', 'ግባ').
  t: (en: string, am: string) => string;
  // Picks the field for the current language from bilingual records, e.g. pick(pkg, 'title').
  pick: (record: Record<string, any> | null | undefined, field: string) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tod-lang');
      if (saved === 'am' || saved === 'en') setLangState(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('tod-lang', l);
    } catch {
      /* storage blocked */
    }
  }, []);
  const t = useCallback((en: string, am: string) => (lang === 'am' ? am : en), [lang]);
  const pick = useCallback(
    (r: Record<string, any> | null | undefined, field: string) => {
      if (!r) return '';
      const v = lang === 'am' ? r[`${field}Am`] : r[`${field}En`];
      return v ?? r[`${field}En`] ?? '';
    },
    [lang],
  );
  return <Ctx.Provider value={{ lang, setLang, t, pick }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLang outside LanguageProvider');
  return c;
}
