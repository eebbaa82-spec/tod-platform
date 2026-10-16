'use client';
import { RequireAuth } from '@/components/shell';
import { ConsoleNav } from '@/components/console-nav';
import { STAFF_ROLES } from '@/lib/session';
import { useLang } from '@/lib/i18n';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <RequireAuth roles={STAFF_ROLES}>
      <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6">
        <aside className="md:sticky md:top-20 md:self-start">
          <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-stone-500 md:block">{t('Staff console', 'የሠራተኞች ኮንሶል')}</p>
          <ConsoleNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </RequireAuth>
  );
}
