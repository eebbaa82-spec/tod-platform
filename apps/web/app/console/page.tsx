'use client';
import Link from 'next/link';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { ErrorText, PageTitle, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface Overview {
  requestsToScope: number;
  oldestRequest: string | null;
  openNoProposal: number;
  awaitingFunding: number;
  inProgress: number;
  openDisputes: number;
  pendingApprovals: number;
  openTickets: number;
  confidentialUnacknowledged: number;
  identityPending: number;
  vettingPending: number;
  clientLevelsToConfirm: number;
  at: string;
}

function age(from: string | null, to: string) {
  if (!from) return null;
  const h = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 3600_000));
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export default function ConsoleHome() {
  const { t, lang } = useLang();
  const { has, me } = useSession();
  const canOverview = has(...CONSOLE_ROLES.overview);
  const { data, error, loading } = useApi<Overview>(canOverview ? '/admin/overview' : null);

  if (!canOverview) {
    return (
      <>
        <PageTitle sub={t('Choose a section from the menu.', 'ከምናሌው ክፍል ይምረጡ።')}>{t(`Welcome, ${me?.displayName ?? ''}`, `እንኳን ደህና መጡ፣ ${me?.displayName ?? ''}`)}</PageTitle>
        <p className="text-sm text-stone-600">{t('Your role has read access to the sections listed in the menu.', 'ሚናዎ በምናሌው ላሉት ክፍሎች የማንበብ ፈቃድ አለው።')}</p>
      </>
    );
  }

  const cards: { label: string; value: number; href: string; show: boolean; note?: string | null; urgent?: boolean }[] = data
    ? [
        { label: t('Requests to scope', 'ለመቅረጽ የሚጠብቁ ጥያቄዎች'), value: data.requestsToScope, href: '/console/assignments?status=REQUESTED', show: has(...CONSOLE_ROLES.assignments), note: data.oldestRequest ? t(`Oldest waiting ${age(data.oldestRequest, data.at)}`, `ረጅሙ የጠበቀ ${age(data.oldestRequest, data.at)}`) : null, urgent: data.requestsToScope > 0 },
        { label: t('Open, no proposal yet', 'ክፍት፣ ገና ምንም ሀሳብ የለም'), value: data.openNoProposal, href: '/console/assignments?status=OPEN', show: has(...CONSOLE_ROLES.assignments) },
        { label: t('Awaiting funding', 'ክፍያ የሚጠብቁ'), value: data.awaitingFunding, href: '/console/assignments?status=AGREED', show: has(...CONSOLE_ROLES.assignments) },
        { label: t('In progress', 'በሂደት ላይ'), value: data.inProgress, href: '/console/assignments?status=FUNDED', show: has(...CONSOLE_ROLES.assignments), note: t('Funded or delivered', 'የተከፈለ ወይም የደረሰ') },
        { label: t('Open disputes', 'ክፍት ክርክሮች'), value: data.openDisputes, href: '/console/disputes', show: has(...CONSOLE_ROLES.disputes), urgent: data.openDisputes > 0 },
        { label: t('Pending approvals', 'የሚጠብቁ ማጽደቂያዎች'), value: data.pendingApprovals, href: '/console/approvals', show: has(...CONSOLE_ROLES.approvals), urgent: data.pendingApprovals > 0 },
        { label: t('Open tickets', 'ክፍት ትኬቶች'), value: data.openTickets, href: '/console/tickets?status=OPEN', show: has(...CONSOLE_ROLES.tickets) },
        { label: t('Confidential cases not acknowledged', 'ያልተረጋገጡ ሚስጥራዊ ጉዳዮች'), value: data.confidentialUnacknowledged, href: '/console/tickets?confidential=true', show: has(...CONSOLE_ROLES.tickets), urgent: data.confidentialUnacknowledged > 0, note: me?.safeguardingDesignated ? null : t('Designated staff only', 'ለተመደቡ ሠራተኞች ብቻ') },
        { label: t('Identity pending', 'ማንነት በመጠባበቅ ላይ'), value: data.identityPending, href: '/console/users?identity=PENDING', show: has(...CONSOLE_ROLES.users), note: t('Unverified or pending, active talents and clients', 'ያልተረጋገጡ ወይም በመጠባበቅ ላይ') },
        { label: t('Vetting pending', 'ግምገማ በመጠባበቅ ላይ'), value: data.vettingPending, href: '/console/users?role=TALENT', show: has(...CONSOLE_ROLES.users), note: t('Not started or in progress', 'ያልተጀመረ ወይም በሂደት ላይ') },
        { label: t('Client levels to confirm', 'የሚረጋገጡ የደንበኛ ደረጃዎች'), value: data.clientLevelsToConfirm, href: '/console/users?role=CLIENT', show: has(...CONSOLE_ROLES.users), note: t('Verified enterprise, not yet confirmed', 'የተረጋገጠ ድርጅት፣ ገና ያልጸደቀ') },
      ]
    : [];

  return (
    <>
      <PageTitle sub={data ? t(`As of ${date(data.at, lang, true)}`, `እስከ ${date(data.at, lang, true)}`) : undefined}>{t('Overview', 'አጠቃላይ እይታ')}</PageTitle>
      {loading && !data && <Spinner />}
      <ErrorText error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter((c) => c.show)
          .map((c) => (
            <Link key={c.label} href={c.href} className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:border-brand-500 ${c.urgent ? 'border-amber-300' : 'border-stone-200'}`}>
              <p className="text-sm text-stone-600">{c.label}</p>
              <p className="mt-1 text-3xl font-bold">{c.value}</p>
              {c.note && <p className="mt-1 text-xs text-stone-500">{c.note}</p>}
            </Link>
          ))}
      </div>
    </>
  );
}
