'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';

// Roles on each section mirror the @Roles on the API routes the page reads.
export const CONSOLE_ROLES = {
  overview: ['SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'MEL_OFFICER'],
  users: ['SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  staff: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
  assignments: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR'],
  assignmentsManage: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  disputes: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR'],
  disputesManage: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  approvals: ['FINANCE_OFFICER', 'SUPER_ADMIN'],
  tickets: ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN'],
  catalogue: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT', 'VETTING_OFFICER', 'AUDITOR'],
  catalogueEdit: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  parameters: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER'],
  parametersEdit: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
  reports: ['MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'PARTNER_VIEWER'],
  reportsExport: ['MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR'],
  audit: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'FINANCE_OFFICER', 'AUDITOR'],
  auditVerify: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'AUDITOR'],
  funding: ['FINANCE_OFFICER', 'SUPER_ADMIN', 'PLATFORM_ADMIN', 'AUDITOR'],
  fundingConfirm: ['FINANCE_OFFICER', 'SUPER_ADMIN'],
} as const;

export function ConsoleNav() {
  const { t } = useLang();
  const { has } = useSession();
  const path = usePathname();
  const can = (k: keyof typeof CONSOLE_ROLES) => has(...CONSOLE_ROLES[k]);

  const items: { href: string; label: string; show: boolean }[] = [
    { href: '/console', label: t('Overview', 'አጠቃላይ'), show: true },
    { href: '/console/users', label: t('Users', 'ተጠቃሚዎች'), show: can('users') },
    { href: '/console/assignments', label: t('Assignments', 'ሥራዎች'), show: can('assignments') },
    { href: '/console/disputes', label: t('Disputes', 'ክርክሮች'), show: can('disputes') },
    { href: '/console/approvals', label: t('Approvals', 'ማጽደቂያዎች'), show: can('approvals') },
    { href: '/console/tickets', label: t('Helpdesk', 'የእርዳታ ዴስክ'), show: can('tickets') },
    { href: '/console/tickets/assisted', label: t('Assisted registration', 'የታገዘ ምዝገባ'), show: can('tickets') },
    { href: '/console/catalogue', label: t('Catalogue', 'የአገልግሎት ዝርዝር'), show: can('catalogue') },
    { href: '/console/parameters', label: t('Parameters', 'መለኪያዎች'), show: can('parameters') },
    { href: '/console/reports', label: t('Reports', 'ሪፖርቶች'), show: can('reports') },
    { href: '/console/audit', label: t('Audit log', 'የኦዲት መዝገብ'), show: can('audit') },
    { href: '/console/staff', label: t('Staff and announcements', 'ሠራተኞች እና ማስታወቂያዎች'), show: can('staff') },
    { href: '/console/funding', label: t('Funding', 'ክፍያ'), show: can('funding') },
  ];

  const active = (href: string) => {
    if (href === '/console') return path === '/console';
    if (href === '/console/tickets') return path.startsWith('/console/tickets') && !path.startsWith('/console/tickets/assisted');
    return path === href || path.startsWith(`${href}/`);
  };

  return (
    <nav aria-label={t('Console sections', 'የኮንሶል ክፍሎች')} className="-mx-4 overflow-x-auto border-b border-stone-200 px-4 pb-2 md:mx-0 md:overflow-visible md:border-b-0 md:px-0 md:pb-0">
      <ul className="flex gap-1 md:flex-col">
        {items
          .filter((i) => i.show)
          .map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm ${active(i.href) ? 'bg-brand-50 font-semibold text-brand-700' : 'text-stone-700 hover:bg-stone-100'}`}
              >
                {i.label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
