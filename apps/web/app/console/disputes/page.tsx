'use client';
import Link from 'next/link';
import { useState } from 'react';
import { qs, useAgents } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Badge, Card, ErrorText, PageTitle, Spinner, Table } from '@/components/ui';
import { etb, humanise, shortDate } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

const DISPUTE_STAGES = ['INTAKE', 'FACILITATION', 'DECISION', 'APPEAL', 'CLOSED'];

export default function DisputesPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.disputes]}>
      <Disputes />
    </RequireAuth>
  );
}

function Disputes() {
  const { t } = useLang();
  const [stage, setStage] = useState('');
  const { data, error, loading } = useApi<any[]>(`/disputes${qs({ stage })}`);
  const { name } = useAgents();
  const now = Date.now();
  const tabs = [{ v: '', l: t('All', 'ሁሉም') }, ...DISPUTE_STAGES.map((s) => ({ v: s, l: humanise(s) }))];

  return (
    <>
      <PageTitle sub={t('Intake, facilitation, decision and appeal, with working-day limits.', 'መቀበል፣ ማመቻቸት፣ ውሳኔ እና ይግባኝ።')}>{t('Disputes', 'ክርክሮች')}</PageTitle>
      <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((x) => (
          <button key={x.v} role="tab" aria-selected={stage === x.v} onClick={() => setStage(x.v)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${stage === x.v ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300'}`}>
            {x.l}
          </button>
        ))}
      </div>
      <Card>
        <ErrorText error={error} />
        {loading && !data ? (
          <Spinner />
        ) : (
          <Table
            head={[t('Case', 'ጉዳይ'), t('Assignment', 'ሥራ'), t('Stage', 'ደረጃ'), t('Decision', 'ውሳኔ'), t('Amount', 'መጠን'), t('Opened', 'የተከፈተ'), t('Decision due', 'የውሳኔ ቀን'), t('Owner', 'ባለቤት')]}
            empty={t('No disputes at this stage.', 'በዚህ ደረጃ ክርክር የለም።')}
            rows={(data ?? []).map((d) => {
              const late = d.stage !== 'CLOSED' && !d.decisionStatus && new Date(d.limits.decisionBy).getTime() < now;
              return [
                <Link key="r" href={`/console/disputes/${d.id}`} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
                  {d.ref}
                </Link>,
                <span key="a">
                  <span className="whitespace-nowrap text-xs text-stone-500">{d.assignment.ref}</span>
                  <span className="block">{d.assignment.title}</span>
                </span>,
                <Badge key="s" tone={d.stage === 'CLOSED' ? 'gray' : 'amber'}>{humanise(d.stage)}</Badge>,
                d.decisionStatus ? <Badge key="d" tone={d.decisionStatus === 'REJECTED' ? 'red' : d.decisionStatus === 'PENDING_APPROVAL' ? 'amber' : 'green'}>{humanise(d.decisionStatus)}</Badge> : '—',
                <span key="m" className="whitespace-nowrap">{etb(d.amountDisputed)}</span>,
                <span key="o" className="whitespace-nowrap">{shortDate(d.createdAt)}</span>,
                <span key="l" className={`whitespace-nowrap ${late ? 'font-semibold text-red-700' : ''}`}>{shortDate(d.limits.decisionBy)}{late ? ` · ${t('late', 'ዘግይቷል')}` : ''}</span>,
                name(d.ownerId),
              ];
            })}
          />
        )}
      </Card>
    </>
  );
}
