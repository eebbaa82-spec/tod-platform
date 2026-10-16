'use client';
import Link from 'next/link';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Card, Empty, LinkButton, PageTitle, Spinner } from '@/components/ui';
import { AssignmentStatus, identityLabel, vettingLabel } from '@/components/work-common';
import { etb, date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';
import { useSession } from '@/lib/session';

const FINISHED = ['CLOSED', 'CANCELLED'];

export default function DashboardPage() {
  return (
    <RequireAuth roles={['TALENT', 'CLIENT']}>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { t } = useLang();
  const { me, has } = useSession();
  return (
    <div className="space-y-8">
      <PageTitle sub={t('Everything you need to do is listed here.', 'ማድረግ ያለብዎት ሁሉ እዚህ ተዘርዝሯል።')}>
        {t(`Hello, ${me?.displayName ?? ''}`, `ሰላም፣ ${me?.displayName ?? ''}`)}
      </PageTitle>
      {has('CLIENT') && <ClientSection />}
      {has('TALENT') && <TalentSection />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talent
// ---------------------------------------------------------------------------

function TalentSection() {
  const { t, pick, lang } = useLang();
  const profile = useApi<any>('/talent/me');
  const mine = useApi<{ assigned: any[]; invitations: any[] }>('/assignments/mine/talent');

  const assigned = mine.data?.assigned ?? [];
  const active = assigned.filter((a) => !FINISHED.includes(a.status));
  const finished = assigned.filter((a) => FINISHED.includes(a.status));
  const invitations = mine.data?.invitations ?? [];
  const pending = useApi<any[]>('/ratings/pending');
  const toRate = (pending.data ?? []).filter((r) => r.direction === 'TALENT_TO_CLIENT');
  const now = Date.now();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">{t('My work as a talent', 'እንደ ባለሙያ ሥራዬ')}</h2>
      {profile.loading ? <Spinner /> : profile.data && <TalentChecklist p={profile.data} />}

      <Card title={t('New invitations', 'አዲስ ግብዣዎች')}>
        {mine.loading ? (
          <Spinner />
        ) : invitations.length === 0 ? (
          <Empty>{t('No invitations right now. We will send you an SMS when a client needs you.', 'አሁን ግብዣ የለም። ደንበኛ ሲፈልግዎ በSMS እናሳውቅዎታለን።')}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {invitations.map((inv) => {
              const a = inv.assignment;
              const pv = a.packageVersion;
              const expired = new Date(inv.respondBy).getTime() < now;
              return (
                <li key={inv.id}>
                  <Link href={`/assignments/${a.id}`} className="flex flex-col gap-1 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{pv ? pick(pv, 'title') : a.title}</p>
                      <p className="text-xs text-stone-500">{a.ref}</p>
                      <p className="text-sm text-stone-700">
                        {pv ? t(`Package price ${etb(pv.priceStandard)}`, `የጥቅል ዋጋ ${etb(pv.priceStandard)}`) : a.budgetMax ? t(`Budget up to ${etb(a.budgetMax)}`, `በጀት እስከ ${etb(a.budgetMax)}`) : null}
                      </p>
                    </div>
                    <div className="text-sm sm:text-right">
                      {inv.status === 'PROPOSED' ? (
                        <Badge tone="blue">{t('Offer sent', 'ቅናሽ ተልኳል')}</Badge>
                      ) : expired ? (
                        <Badge tone="gray">{t('Time has passed', 'ጊዜው አልፏል')}</Badge>
                      ) : (
                        <>
                          <Badge tone="amber">{t('Answer needed', 'መልስ ያስፈልጋል')}</Badge>
                          <p className="mt-1 text-xs text-stone-600">{t('Reply by', 'የመልስ ቀነ ገደብ')} {date(inv.respondBy, lang, true)}</p>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {toRate.length > 0 && (
        <Card title={t('Please rate your clients', 'እባክዎ ደንበኞችዎን ይገምግሙ')}>
          <ul className="space-y-2">
            {toRate.map((r) => (
              <li key={r.assignmentId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium">{r.title}</span> <span className="text-stone-500">{r.ref}</span>
                </span>
                <LinkButton href={`/assignments/${r.assignmentId}#rate`} tone="secondary">{t('Rate now', 'አሁን ይገምግሙ')}</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={t('My active work', 'በሂደት ላይ ያሉ ሥራዎቼ')}>
        {mine.loading ? <Spinner /> : <AssignmentList items={active} role="TALENT" empty={t('No active work yet.', 'ገና በሂደት ላይ ያለ ሥራ የለም።')} />}
      </Card>
      {finished.length > 0 && (
        <Card title={t('Finished work', 'የተጠናቀቁ ሥራዎች')}>
          <AssignmentList items={finished} role="TALENT" empty="" />
        </Card>
      )}
    </section>
  );
}

function TalentChecklist({ p }: { p: any }) {
  const { t } = useLang();
  const idStatus = p.identity?.status;
  const steps = [
    {
      done: p.completeness >= 100,
      label: t(`Complete your profile (${p.completeness}% done)`, `መገለጫዎን ያሟሉ (${p.completeness}% ተጠናቋል)`),
      href: '/profile/talent',
      action: t('Edit profile', 'መገለጫ ያስተካክሉ'),
    },
    {
      done: idStatus === 'VERIFIED' || idStatus === 'PROVISIONAL',
      label: t(`Verify your identity with Fayda (${identityLabel(idStatus, t)})`, `ማንነትዎን በፋይዳ ያረጋግጡ (${identityLabel(idStatus, t)})`),
      href: '/account',
      action: t('Go to account', 'ወደ መለያ'),
    },
    {
      done: p.vettingStatus === 'APPROVED',
      label: t(`Get vetted (${vettingLabel(p.vettingStatus, t)})`, `ምዘና ያድርጉ (${vettingLabel(p.vettingStatus, t)})`),
      href: '/profile/talent#vetting',
      action: t('See vetting', 'ምዘናን ይመልከቱ'),
    },
    {
      done: !!p.payoutChannel && !!p.payoutNameVerified,
      label: p.payoutChannel && !p.payoutNameVerified ? t('Payout account: the name does not match your verified name yet', 'የክፍያ መቀበያ ሂሳብ፦ ስሙ ከተረጋገጠው ስምዎ ጋር ገና አልተዛመደም') : t('Add the account where you get paid', 'ክፍያ የሚቀበሉበትን ሂሳብ ያክሉ'),
      href: '/profile/talent#payout',
      action: t('Add account', 'ሂሳብ ያክሉ'),
    },
    {
      done: !!p.publishedAt,
      label: p.publishedAt ? t('Your profile is public. Clients can find you.', 'መገለጫዎ ይፋ ነው። ደንበኞች ሊያገኙዎት ይችላሉ።') : t('Your profile goes public after vetting and identity are done', 'ምዘና እና ማንነት ሲጠናቀቁ መገለጫዎ ይፋ ይሆናል'),
      href: '',
      action: '',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return (
    <Card title={t(`Get ready for work (${doneCount} of ${steps.length} done)`, `ለሥራ ይዘጋጁ (${steps.length} ውስጥ ${doneCount} ተጠናቀዋል)`)}>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-100 p-3">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${s.done ? 'bg-green-600 text-white' : 'bg-stone-200 text-stone-700'}`}>{s.done ? '✓' : i + 1}</span>
            <span className={`flex-1 text-sm ${s.done ? 'text-stone-500' : 'font-medium'}`}>{s.label}</span>
            {!s.done && s.href && (
              <LinkButton href={s.href} tone="secondary" className="w-full sm:w-auto">
                {s.action}
              </LinkButton>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function ClientSection() {
  const { t } = useLang();
  const mine = useApi<any[]>('/assignments/mine/client');
  const pending = useApi<any[]>('/ratings/pending');
  const client = useApi<{ profile: any; limit: any }>('/clients/me');
  const items = mine.data ?? [];
  const active = items.filter((a) => !FINISHED.includes(a.status));
  const finished = items.filter((a) => FINISHED.includes(a.status));
  const toRate = (pending.data ?? []).filter((r) => r.direction === 'CLIENT_TO_TALENT');

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('Work I asked for', 'የጠየቅኩት ሥራ')}</h2>
        <LinkButton href="/request/new" className="w-full sm:w-auto">
          {t('Request work', 'ሥራ ይጠይቁ')}
        </LinkButton>
      </div>
      {client.data && !client.data.profile && (
        <Alert tone="warning">
          {t('Tell us about your business before you request work.', 'ሥራ ከመጠየቅዎ በፊት ስለ ንግድዎ ይንገሩን።')}{' '}
          <Link href="/profile/client" className="font-semibold underline">{t('Fill in business profile', 'የንግድ መገለጫ ይሙሉ')}</Link>
        </Alert>
      )}
      {toRate.length > 0 && (
        <Card title={t('Please rate your talent', 'እባክዎ ባለሙያዎን ይገምግሙ')}>
          <ul className="space-y-2">
            {toRate.map((r) => (
              <li key={r.assignmentId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium">{r.title}</span> <span className="text-stone-500">{r.ref}</span>
                </span>
                <LinkButton href={`/assignments/${r.assignmentId}#rate`} tone="secondary">{t('Rate now', 'አሁን ይገምግሙ')}</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={t('Active requests', 'በሂደት ላይ ያሉ ጥያቄዎች')}>
        {mine.loading ? <Spinner /> : <AssignmentList items={active} role="CLIENT" empty={t('You have not requested any work yet.', 'ገና ምንም ሥራ አልጠየቁም።')} />}
      </Card>
      {finished.length > 0 && (
        <Card title={t('Finished and cancelled', 'የተጠናቀቁ እና የተሰረዙ')}>
          <AssignmentList items={finished} role="CLIENT" empty="" />
        </Card>
      )}
    </section>
  );
}

function nextStep(a: any, role: 'CLIENT' | 'TALENT', t: (en: string, am: string) => string): { text: string; urgent: boolean } {
  const ms: any[] = a.milestones ?? [];
  if (a.cancelRequestedById && ['FUNDED', 'DELIVERED'].includes(a.status)) return { text: t('Cancellation asked: please answer', 'መሰረዝ ተጠይቋል፦ እባክዎ ይመልሱ'), urgent: true };
  if (role === 'CLIENT') {
    switch (a.status) {
      case 'REQUESTED':
        return { text: t('Our team is turning your request into a package', 'ቡድናችን ጥያቄዎን ወደ ጥቅል እየቀየረ ነው'), urgent: false };
      case 'OPEN':
        return (a._count?.proposals ?? 0) > 0 ? { text: t(`Choose an offer (${a._count.proposals} received)`, `ቅናሽ ይምረጡ (${a._count.proposals} ደርሰዋል)`), urgent: true } : { text: t('Waiting for offers from talents', 'ከባለሙያዎች ቅናሽ በመጠበቅ ላይ'), urgent: false };
      case 'AGREED':
        return { text: t('Pay into escrow', 'ክፍያውን ለአጋር ባንኩ ያስገቡ'), urgent: true };
      case 'FUNDED':
        return { text: t('The talent is working', 'ባለሙያው እየሠራ ነው'), urgent: false };
      case 'DELIVERED':
        return { text: t('Review the delivery', 'የቀረበውን ሥራ ይገምግሙ'), urgent: true };
      case 'DISPUTED':
        return { text: t('Dispute being handled', 'ክርክሩ እየታየ ነው'), urgent: false };
      case 'ACCEPTED':
        return { text: t('Payment is being released', 'ክፍያው እየተለቀቀ ነው'), urgent: false };
      case 'CLOSED':
        return { text: t('Finished', 'ተጠናቋል'), urgent: false };
      default:
        return { text: t('Cancelled', 'ተሰርዟል'), urgent: false };
    }
  }
  switch (a.status) {
    case 'AGREED':
      return { text: t('Wait: do not start until the bank confirms payment', 'ይጠብቁ፦ ባንኩ ክፍያውን እስኪያረጋግጥ አይጀምሩ'), urgent: false };
    case 'FUNDED':
      return ms.some((m) => m.status === 'REVISION_REQUESTED') ? { text: t('Make the changes the client asked for', 'ደንበኛው የጠየቀውን ማስተካከያ ያድርጉ'), urgent: true } : { text: t('Do the work and deliver it', 'ሥራውን ሠርተው ያስረክቡ'), urgent: true };
    case 'DELIVERED':
      return { text: t('Waiting for the client to review', 'ደንበኛው እስኪገመግም በመጠበቅ ላይ'), urgent: false };
    case 'DISPUTED':
      return { text: t('Dispute being handled', 'ክርክሩ እየታየ ነው'), urgent: false };
    case 'ACCEPTED':
      return { text: t('Your payment is on its way', 'ክፍያዎ በመንገድ ላይ ነው'), urgent: false };
    case 'CLOSED':
      return { text: t('Finished', 'ተጠናቋል'), urgent: false };
    default:
      return { text: t('Cancelled', 'ተሰርዟል'), urgent: false };
  }
}

function AssignmentList({ items, role, empty }: { items: any[]; role: 'CLIENT' | 'TALENT'; empty: string }) {
  const { t, lang } = useLang();
  if (!items.length) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((a) => {
        const step = nextStep(a, role, t);
        const nextDeadline = (a.milestones ?? []).find((m: any) => ['IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status))?.deadline;
        const reviewEnd = (a.milestones ?? []).find((m: any) => m.status === 'DELIVERED')?.reviewWindowEndsAt;
        return (
          <li key={a.id}>
            <Link href={`/assignments/${a.id}`} className="flex min-h-11 flex-col gap-1 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="text-xs text-stone-500">
                  {a.ref}
                  {a.agreedPrice ? ` · ${etb(a.agreedPrice)}` : ''}
                </p>
                <p className={`text-sm ${step.urgent ? 'font-semibold text-brand-700' : 'text-stone-600'}`}>
                  {step.urgent ? '→ ' : ''}
                  {step.text}
                </p>
                {nextDeadline && <p className="text-xs text-stone-500">{t('Due', 'የማስረከቢያ ቀን')}: {date(nextDeadline, lang)}</p>}
                {reviewEnd && <p className="text-xs text-stone-500">{t('Review by', 'የግምገማ ቀነ ገደብ')}: {date(reviewEnd, lang)}</p>}
              </div>
              <div className="shrink-0">
                <AssignmentStatus status={a.status} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
