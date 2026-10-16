'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterBar, Notice, qs } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Button, Card, ErrorText, Field, Input, Modal, PageTitle, Select, Spinner, StatusBadge, Table, Textarea, useAction } from '@/components/ui';
import { get, post } from '@/lib/api';
import { etb, shortDate, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const STATUSES = ['REQUESTED', 'OPEN', 'AGREED', 'FUNDED', 'DELIVERED', 'ACCEPTED', 'DISPUTED', 'CLOSED', 'CANCELLED'];

export default function AssignmentsPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.assignments]}>
      <Suspense fallback={<Spinner />}>
        <Assignments />
      </Suspense>
    </RequireAuth>
  );
}

function usePackages(enabled: boolean) {
  const { data } = useApi<any[]>(enabled ? '/catalogue/admin/packages' : null);
  return (data ?? []).filter((p) => p.status === 'ACTIVE' && p.currentVersion);
}

function Assignments() {
  const { t } = useLang();
  const { has } = useSession();
  const sp = useSearchParams();
  const manage = has(...CONSOLE_ROLES.assignmentsManage);
  const [draft, setDraft] = useState({ status: sp.get('status') ?? '', q: sp.get('q') ?? '' });
  const [applied, setApplied] = useState(draft);
  const { data, error, loading, reload } = useApi<any[]>(`/assignments${qs(applied)}`);
  const [scoping, setScoping] = useState<any>(null);
  const [ok, setOk] = useState<string | null>(null);
  const packages = usePackages(manage);
  const rematch = useAction();

  return (
    <>
      <PageTitle sub={t('Search every assignment. New requests are scoped here and sent to matching.', 'ሁሉንም ሥራዎች ይፈልጉ። አዳዲስ ጥያቄዎች እዚህ ይቀረጻሉ።')}>{t('Assignments', 'ሥራዎች')}</PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        <Card>
          <FilterBar onSubmit={() => setApplied(draft)}>
            <Field label={t('Reference or title', 'መለያ ወይም ርዕስ')}>
              <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="TODA-…" />
            </Field>
            <Field label={t('Status', 'ሁኔታ')}>
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} options={[{ value: '', label: t('Any status', 'ማንኛውም') }, ...STATUSES.map((s) => ({ value: s, label: s.toLowerCase() }))]} />
            </Field>
            <div>
              <Button type="submit">{t('Search', 'ፈልግ')}</Button>
            </div>
          </FilterBar>
          <ErrorText error={error ?? rematch.error} />
          {loading && !data ? (
            <Spinner />
          ) : (
            <Table
              head={[t('Reference', 'መለያ'), t('Title', 'ርዕስ'), t('Status', 'ሁኔታ'), t('Budget / price', 'በጀት / ዋጋ'), t('Invited / proposals', 'የተጋበዙ / ሀሳቦች'), t('Created', 'የተፈጠረ'), t('Updated', 'የተሻሻለ'), '']}
              empty={t('No assignments match.', 'የሚዛመድ ሥራ የለም።')}
              rows={(data ?? []).map((a) => [
                <Link key="r" href={`/assignments/${a.id}`} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
                  {a.ref}
                </Link>,
                <span key="t">
                  {a.title}
                  {a.custom && <span className="ml-1 text-xs text-stone-500">({t('custom', 'ብጁ')})</span>}
                </span>,
                <StatusBadge key="s" status={a.status} />,
                <span key="p" className="whitespace-nowrap">{a.agreedPrice ? etb(a.agreedPrice) : a.budgetMax ? `≤ ${etb(a.budgetMax)}` : '—'}</span>,
                `${a._count?.invitations ?? 0} / ${a._count?.proposals ?? 0}`,
                <span key="c" className="whitespace-nowrap">{shortDate(a.createdAt)}</span>,
                <span key="u" className="whitespace-nowrap">{shortDate(a.updatedAt)}</span>,
                manage && a.status === 'REQUESTED' ? (
                  <Button key="x" tone="secondary" className="!min-h-9" onClick={() => setScoping(a)}>
                    {t('Scope', 'ቅረጽ')}
                  </Button>
                ) : manage && a.status === 'OPEN' ? (
                  <Button
                    key="x"
                    tone="secondary"
                    className="!min-h-9"
                    busy={rematch.busy}
                    onClick={async () => {
                      const r: any = await rematch.run(() => post(`/assignments/${a.id}/rematch`));
                      if (r) {
                        setOk(t(`${a.ref}: ${r.invited} more talents invited.`, `${a.ref}፦ ${r.invited} ተጨማሪ ተሰጥኦዎች ተጋብዘዋል።`));
                        reload();
                      }
                    }}
                  >
                    {t('Re-match', 'እንደገና አዛምድ')}
                  </Button>
                ) : (
                  ''
                ),
              ])}
            />
          )}
        </Card>
        {has('SUPPORT_AGENT') && <PostOnBehalf packages={packages} onDone={(a) => { setOk(t(`Posted ${a.ref}.`, `${a.ref} ተለጥፏል።`)); reload(); }} />}
      </div>
      {scoping && (
        <ScopeModal
          a={scoping}
          packages={packages}
          onClose={() => setScoping(null)}
          onDone={() => {
            setOk(t(`${scoping.ref} scoped and sent to matching.`, `${scoping.ref} ተቀርጾ ወደ ማዛመድ ተልኳል።`));
            setScoping(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function ScopeModal({ a, packages, onClose, onDone }: { a: any; packages: any[]; onClose: () => void; onDone: () => void }) {
  const { t, pick } = useLang();
  const { data: areas } = useApi<any[]>('/catalogue/service-areas');
  const [mode, setMode] = useState<'package' | 'custom'>('package');
  const [f, setF] = useState({ packageCode: '', serviceAreaCode: '', title: a.title ?? '', brief: a.brief ?? '', budget: a.budgetMax ? String(a.budgetMax / 100) : '', criteria: '' });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const criteria = f.criteria.split('\n').map((s) => s.trim()).filter(Boolean);
  const chosen = packages.find((p) => p.code === f.packageCode);

  return (
    <Modal open onClose={onClose} title={t(`Scope ${a.ref}`, `${a.ref} ቅረጽ`)}>
      <div className="mb-3 rounded-lg bg-stone-100 p-3 text-sm">
        <p className="font-medium">{t("Client's request", 'የደንበኛው ጥያቄ')}</p>
        <p className="whitespace-pre-wrap text-stone-700">{a.brief}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body =
            mode === 'package'
              ? { packageCode: f.packageCode, ...(f.title ? { title: f.title } : {}) }
              : { serviceAreaCode: f.serviceAreaCode, title: f.title, brief: f.brief, budgetMax: toSantim(f.budget), acceptanceCriteria: criteria };
          const r = await act.run(() => post(`/assignments/${a.id}/scope`, body));
          if (r) onDone();
        }}
      >
        <Select
          aria-label={t('Scope type', 'የቅርጽ ዓይነት')}
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          options={[
            { value: 'package', label: t('Match to a standard package', 'ከመደበኛ ጥቅል ጋር አዛምድ') },
            { value: 'custom', label: t('Custom scope (Expert-tier talents only)', 'ብጁ ቅርጽ (ለባለሙያ ደረጃ ብቻ)') },
          ]}
        />
        {mode === 'package' ? (
          <>
            <Field label={t('Package', 'ጥቅል')}>
              <Select value={f.packageCode} onChange={set('packageCode')} required options={[{ value: '', label: t('Choose…', 'ይምረጡ…') }, ...packages.map((p) => ({ value: p.code, label: `${p.code}: ${pick(p.currentVersion, 'title')} (${etb(p.currentVersion.priceStandard)})` }))]} />
            </Field>
            {chosen && <p className="text-xs text-stone-600">{pick(chosen.currentVersion, 'scope')}</p>}
            <Field label={t('Title shown to talents (optional)', 'ለተሰጥኦዎች የሚታይ ርዕስ (አማራጭ)')}>
              <Input value={f.title} onChange={set('title')} maxLength={160} />
            </Field>
          </>
        ) : (
          <>
            <Field label={t('Service area', 'የአገልግሎት ዘርፍ')}>
              <Select value={f.serviceAreaCode} onChange={set('serviceAreaCode')} required options={[{ value: '', label: t('Choose…', 'ይምረጡ…') }, ...(areas ?? []).map((s) => ({ value: s.code, label: pick(s, 'name') }))]} />
            </Field>
            <Field label={t('Title', 'ርዕስ')}>
              <Input value={f.title} onChange={set('title')} required maxLength={160} />
            </Field>
            <Field label={t('Brief', 'መግለጫ')}>
              <Textarea value={f.brief} onChange={set('brief')} required maxLength={4000} />
            </Field>
            <Field label={t('Budget (birr)', 'በጀት (ብር)')}>
              <Input type="number" min={1} step="0.01" value={f.budget} onChange={set('budget')} required />
            </Field>
            <Field label={t('Acceptance criteria, one per line', 'የመቀበያ መስፈርቶች፣ በየመስመሩ አንድ')} hint={t('The client signs off against these.', 'ደንበኛው በእነዚህ ላይ ተመሥርቶ ይቀበላል።')}>
              <Textarea value={f.criteria} onChange={set('criteria')} required />
            </Field>
          </>
        )}
        <ErrorText error={act.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" tone="secondary" onClick={onClose}>
            {t('Cancel', 'ይቅር')}
          </Button>
          <Button type="submit" busy={act.busy} disabled={mode === 'custom' && (!criteria.length || !f.budget)}>
            {t('Scope and invite talents', 'ቅረጽ እና ተሰጥኦዎችን ጋብዝ')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PostOnBehalf({ packages, onDone }: { packages: any[]; onDone: (a: any) => void }) {
  const { t, pick } = useLang();
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<any[] | null>(null);
  const [client, setClient] = useState<any>(null);
  const blank = { packageCode: '', title: '', brief: '', budget: '', deadline: '', workMode: '' };
  const [f, setF] = useState(blank);
  const find = useAction();
  const act = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Card title={t('Post on behalf of a client', 'ደንበኛን ወክሎ ይለጥፉ')}>
      <p className="mb-3 text-sm text-stone-600">{t('For clients who call or visit the desk. Without a package the request waits in "Requests to scope".', 'ለሚደውሉ ወይም ለሚመጡ ደንበኞች። ያለ ጥቅል ጥያቄው ለመቅረጽ ይጠብቃል።')}</p>
      {!client ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await find.run(() => get<any[]>(`/admin/users${qs({ role: 'CLIENT', text: search })}`));
            if (r) setMatches(r);
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label={t("Client's phone or name", 'የደንበኛው ስልክ ወይም ስም')}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} required />
            </Field>
          </div>
          <Button type="submit" tone="secondary" busy={find.busy}>
            {t('Find client', 'ደንበኛ ፈልግ')}
          </Button>
          <ErrorText error={find.error} />
          {matches && (
            <div className="w-full space-y-1">
              {!matches.length && <p className="text-sm text-stone-500">{t('No client found. Register them first under Assisted registration.', 'ደንበኛ አልተገኘም። መጀመሪያ ይመዝግቡ።')}</p>}
              {matches.map((m) => (
                <button key={m.id} type="button" onClick={() => setClient(m)} className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-brand-500">
                  <span className="font-medium">{m.displayName}</span> · {m.phone} · {m.client?.enterpriseName ?? m.client?.level ?? t('no client profile', 'መገለጫ የለም')}
                </button>
              ))}
            </div>
          )}
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = {
              clientUserId: client.id,
              brief: f.brief,
              ...(f.packageCode ? { packageCode: f.packageCode } : {}),
              ...(f.title ? { title: f.title } : {}),
              ...(f.budget ? { budgetMax: toSantim(f.budget) } : {}),
              ...(f.deadline ? { deadline: f.deadline } : {}),
              ...(f.workMode ? { workMode: f.workMode } : {}),
            };
            const r = await act.run(() => post('/assignments', body));
            if (r) {
              onDone(r);
              setF(blank);
              setClient(null);
              setMatches(null);
            }
          }}
        >
          <p className="text-sm">
            {t('Client', 'ደንበኛ')}: <span className="font-medium">{client.displayName}</span> ({client.phone}){' '}
            <button type="button" className="text-brand-700 underline" onClick={() => setClient(null)}>
              {t('change', 'ቀይር')}
            </button>
          </p>
          <Field label={t('Package (optional)', 'ጥቅል (አማራጭ)')}>
            <Select value={f.packageCode} onChange={set('packageCode')} options={[{ value: '', label: t('None: support will scope it', 'የለም፦ ድጋፍ ይቀርጸዋል') }, ...packages.map((p) => ({ value: p.code, label: `${p.code}: ${pick(p.currentVersion, 'title')}` }))]} />
          </Field>
          <Field label={t('Title (optional)', 'ርዕስ (አማራጭ)')}>
            <Input value={f.title} onChange={set('title')} maxLength={160} />
          </Field>
          <Field label={t('What the client needs', 'ደንበኛው የሚፈልገው')}>
            <Textarea value={f.brief} onChange={set('brief')} required minLength={10} maxLength={4000} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('Budget up to (birr)', 'በጀት እስከ (ብር)')}>
              <Input type="number" min={1} step="0.01" value={f.budget} onChange={set('budget')} />
            </Field>
            <Field label={t('Deadline', 'የመጨረሻ ቀን')}>
              <Input type="date" value={f.deadline} onChange={set('deadline')} />
            </Field>
            <Field label={t('Work mode', 'የሥራ ሁኔታ')}>
              <Select value={f.workMode} onChange={set('workMode')} options={[{ value: '', label: '—' }, { value: 'REMOTE', label: t('Remote', 'ከርቀት') }, { value: 'ONSITE', label: t('On site', 'በቦታው') }, { value: 'BOTH', label: t('Either', 'ሁለቱም') }]} />
            </Field>
          </div>
          <ErrorText error={act.error} />
          <Button type="submit" busy={act.busy}>
            {t('Post request', 'ጥያቄውን ለጥፍ')}
          </Button>
        </form>
      )}
    </Card>
  );
}
