'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterBar, qs, ROLE_OPTIONS } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Badge, Button, Card, ErrorText, Field, Input, PageTitle, Select, Spinner, StatusBadge, Table } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

export default function UsersPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.users]}>
      <Suspense fallback={<Spinner />}>
        <Users />
      </Suspense>
    </RequireAuth>
  );
}

function Users() {
  const { t } = useLang();
  const sp = useSearchParams();
  const [draft, setDraft] = useState({ text: sp.get('text') ?? '', role: sp.get('role') ?? '', status: sp.get('status') ?? '', identity: sp.get('identity') ?? '' });
  const [applied, setApplied] = useState(draft);
  const { data, error, loading } = useApi<any[]>(`/admin/users${qs(applied)}`);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <>
      <PageTitle sub={t('Talents, clients and staff accounts. Up to 100 most recent matches.', 'ተሰጥኦዎች፣ ደንበኞች እና የሠራተኞች መለያዎች።')}>{t('Users', 'ተጠቃሚዎች')}</PageTitle>
      <Card>
        <FilterBar onSubmit={() => setApplied(draft)}>
          <Field label={t('Name or phone', 'ስም ወይም ስልክ')}>
            <Input value={draft.text} onChange={set('text')} placeholder="0911…" />
          </Field>
          <Field label={t('Role', 'ሚና')}>
            <Select value={draft.role} onChange={set('role')} options={[{ value: '', label: t('Any role', 'ማንኛውም') }, ...ROLE_OPTIONS.map((r) => ({ value: r, label: r.replace(/_/g, ' ').toLowerCase() }))]} />
          </Field>
          <Field label={t('Account status', 'የመለያ ሁኔታ')}>
            <Select value={draft.status} onChange={set('status')} options={[{ value: '', label: t('Any status', 'ማንኛውም') }, ...['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'].map((s) => ({ value: s, label: s.toLowerCase() }))]} />
          </Field>
          <Field label={t('Identity', 'ማንነት')}>
            <Select value={draft.identity} onChange={set('identity')} options={[{ value: '', label: t('Any', 'ማንኛውም') }, ...['UNVERIFIED', 'PENDING', 'PROVISIONAL', 'VERIFIED', 'FAILED'].map((s) => ({ value: s, label: s.toLowerCase() }))]} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit">{t('Search', 'ፈልግ')}</Button>
          </div>
        </FilterBar>
        <ErrorText error={error} />
        {loading && !data ? (
          <Spinner />
        ) : (
          <Table
            head={[t('Name', 'ስም'), t('Phone', 'ስልክ'), t('Roles', 'ሚናዎች'), t('Status', 'ሁኔታ'), t('Identity', 'ማንነት'), t('Talent', 'ተሰጥኦ'), t('Client', 'ደንበኛ'), t('Joined', 'የተቀላቀለ')]}
            empty={t('No users match these filters.', 'ከማጣሪያዎቹ ጋር የሚዛመድ ተጠቃሚ የለም።')}
            rows={(data ?? []).map((u) => [
              <Link key="n" href={`/console/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                {u.displayName}
                {u.verifiedName && u.verifiedName !== u.displayName && <span className="block text-xs font-normal text-stone-500">{u.verifiedName}</span>}
              </Link>,
              <span key="p" className="whitespace-nowrap">{u.phone}</span>,
              <div key="r" className="flex flex-wrap gap-1">
                {u.roles.map((r: string) => (
                  <Badge key={r}>{r.replace(/_/g, ' ').toLowerCase()}</Badge>
                ))}
                {u.assisted && <Badge tone="blue">{t('assisted', 'የታገዘ')}</Badge>}
              </div>,
              <StatusBadge key="s" status={u.status} />,
              <StatusBadge key="i" status={u.identityStatus} />,
              u.talent ? <StatusBadge key="t" status={u.talent.vettingStatus} /> : '—',
              u.client ? <span key="c" className="text-xs">{u.client.level.replace(/_/g, ' ').toLowerCase()}{u.client.enterpriseName ? ` · ${u.client.enterpriseName}` : ''}</span> : '—',
              <span key="d" className="whitespace-nowrap">{shortDate(u.createdAt)}</span>,
            ])}
          />
        )}
      </Card>
    </>
  );
}
