'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { ReportConcern } from './report-concern';

export function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useLang();
  const { me, has, isStaff, logout } = useSession();
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!me) return;
    get<{ unreadCount: number }>('/notifications?unread=1').then((r) => setUnread(r.unreadCount ?? 0)).catch(() => {});
  }, [me, path]);
  useEffect(() => setMenu(false), [path]);

  const links: { href: string; label: string }[] = [];
  if (!me) links.push({ href: '/', label: t('Services', 'አገልግሎቶች') });
  if (has('TALENT') || has('CLIENT')) links.push({ href: '/dashboard', label: t('My work', 'ሥራዎቼ') });
  if (has('CLIENT')) links.push({ href: '/request/new', label: t('Request work', 'ሥራ ይጠይቁ') });
  if (has('TALENT')) links.push({ href: '/profile/talent', label: t('My profile', 'መገለጫዬ') });
  if (has('CLIENT')) links.push({ href: '/profile/client', label: t('Business', 'ንግዴ') });
  if (isStaff) links.push({ href: '/console', label: t('Console', 'ኮንሶል') });
  if (me) links.push({ href: '/help', label: t('Help', 'እርዳታ') });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href={me ? (isStaff ? '/console' : '/dashboard') : '/'} className="flex items-center gap-2 font-bold text-brand-700">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">ToD</span>
            <span className="hidden sm:inline">Talent on Demand</span>
          </Link>
          <nav className="ml-4 hidden gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={`rounded-md px-3 py-2 text-sm ${path === l.href || (l.href !== '/' && path.startsWith(l.href)) ? 'bg-brand-50 font-semibold text-brand-700' : 'text-stone-700 hover:bg-stone-100'}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setLang(lang === 'en' ? 'am' : 'en')} className="rounded-md px-2 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100" aria-label="Change language">
              {lang === 'en' ? 'አማርኛ' : 'English'}
            </button>
            {me ? (
              <>
                <Link href="/notifications" className="relative rounded-md p-2 text-stone-700 hover:bg-stone-100" aria-label={t('Notifications', 'ማሳወቂያዎች')}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                  {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
                </Link>
                <Link href="/account" className="hidden rounded-md px-2 py-2 text-sm text-stone-700 hover:bg-stone-100 sm:block">{me.displayName}</Link>
                <button onClick={logout} className="hidden rounded-md px-2 py-2 text-sm text-stone-700 hover:bg-stone-100 md:block">{t('Sign out', 'ውጣ')}</button>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">{t('Sign in', 'ይግቡ')}</Link>
                <Link href="/register" className="hidden rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:block">{t('Join', 'ይቀላቀሉ')}</Link>
              </>
            )}
            <button onClick={() => setMenu(!menu)} className="rounded-md p-2 text-stone-700 hover:bg-stone-100 md:hidden" aria-label="Menu" aria-expanded={menu}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
        {menu && (
          <nav className="border-t border-stone-200 bg-white px-4 py-2 md:hidden">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="block rounded-md px-3 py-3 text-base text-stone-800 hover:bg-stone-100">{l.label}</Link>
            ))}
            {me ? (
              <>
                <Link href="/account" className="block rounded-md px-3 py-3 text-base text-stone-800 hover:bg-stone-100">{t('Account', 'መለያ')}</Link>
                <button onClick={logout} className="block w-full rounded-md px-3 py-3 text-left text-base text-stone-800 hover:bg-stone-100">{t('Sign out', 'ውጣ')}</button>
              </>
            ) : (
              <Link href="/register" className="block rounded-md px-3 py-3 text-base font-semibold text-brand-700">{t('Join', 'ይቀላቀሉ')}</Link>
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-sm text-stone-600">
          <ReportConcern />
          <Link href="/help" className="hover:underline">{t('Help and support', 'እርዳታ እና ድጋፍ')}</Link>
          <Link href="/policies" className="hover:underline">{t('Rules, fees and disputes', 'ደንቦች፣ ክፍያዎች እና ክርክሮች')}</Link>
          <span>{t('Payments are held by our partner bank until you accept the work.', 'ክፍያዎች ሥራውን እስኪቀበሉ ድረስ በአጋር ባንካችን ይያዛሉ።')}</span>
        </div>
      </footer>
    </div>
  );
}

// Sends signed-out visitors to sign in, and checks roles.
export function RequireAuth({ roles, children }: { roles?: string[]; children: React.ReactNode }) {
  const { me, loading, has } = useSession();
  const { t } = useLang();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !me) window.location.href = `/login?next=${encodeURIComponent(path)}`;
  }, [loading, me, path]);
  if (loading || !me) return <div className="py-10 text-center text-sm text-stone-500">{t('Loading…', 'በመጫን ላይ…')}</div>;
  if (roles && !has(...roles)) return <p className="py-10 text-center text-sm text-stone-600">{t('This page is not available for your account.', 'ይህ ገጽ ለመለያዎ አይገኝም።')}</p>;
  return <>{children}</>;
}
