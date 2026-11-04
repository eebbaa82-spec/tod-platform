'use client';
import { useState } from 'react';
import { FilterBar, JsonBlock, qs, shortId } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, ErrorText, Field, Input, PageTitle, Spinner, Table, useAction } from '@/components/ui';
import { get } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function AuditPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.audit]}>
      <Audit />
    </RequireAuth>
  );
}

function Audit() {
  const { t, lang } = useLang();
  const { has } = useSession();
  const blank = { entityType: '', entityId: '', actorId: '', action: '', from: '', to: '' };
  const [draft, setDraft] = useState(blank);
  const [f, setF] = useState(blank);
  const { data, error, loading } = useApi<any[]>(`/admin/audit${qs({ ...f, from: f.from || undefined, to: f.to ? `${f.to}T23:59:59.999` : undefined })}`);
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; brokenAt?: string } | null>(null);
  const v = useAction();
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <>
      <PageTitle
        sub={t('Append-only and hash-chained: each entry seals the one before it.', 'የሚጨመር ብቻ እና በሃሽ የተሳሰረ መዝገብ።')}
        actions={
          has(...CONSOLE_ROLES.auditVerify) ? (
            <Button
              tone="secondary"
              busy={v.busy}
              onClick={async () => {
                const r = await v.run(() => get<{ ok: boolean; checked: number; brokenAt?: string }>('/admin/audit/verify'));
                if (r) setVerify(r);
              }}
            >
              {t('Verify chain', 'ሰንሰለቱን አረጋግጥ')}
            </Button>
          ) : undefined
        }
      >
        {t('Audit log', 'የኦዲት መዝገብ')}
      </PageTitle>
      <div className="space-y-4">
        <ErrorText error={v.error} />
        {verify &&
          (verify.ok ? (
            <Alert tone="success">{t(`Chain intact: ${verify.checked} entries checked, no alteration found.`, `ሰንሰለቱ ያልተነካ ነው፦ ${verify.checked} ግቤቶች ተፈትሸዋል።`)}</Alert>
          ) : (
            <Alert tone="error">{t(`Chain broken at entry ${verify.brokenAt} (of ${verify.checked} checked). Entries from there on may have been altered; report this to the super administrator at once.`, `ሰንሰለቱ በግቤት ${verify.brokenAt} ተሰብሯል። ወዲያውኑ ያሳውቁ።`)}</Alert>
          ))}
        <Card>
          <FilterBar onSubmit={() => setF(draft)}>
            <Field label={t('Entity type', 'የአካል ዓይነት')}>
              <Input value={draft.entityType} onChange={set('entityType')} placeholder="User, Assignment, Dispute…" />
            </Field>
            <Field label={t('Entity id', 'የአካል መለያ')}>
              <Input value={draft.entityId} onChange={set('entityId')} />
            </Field>
            <Field label={t('Actor id', 'የፈጻሚ መለያ')}>
              <Input value={draft.actorId} onChange={set('actorId')} />
            </Field>
            <Field label={t('Action contains', 'ድርጊቱ የያዘው')}>
              <Input value={draft.action} onChange={set('action')} placeholder="DISPUTE" />
            </Field>
            <Field label={t('From', 'ከ')}>
              <Input type="date" value={draft.from} onChange={set('from')} />
            </Field>
            <Field label={t('To', 'እስከ')}>
              <Input type="date" value={draft.to} onChange={set('to')} />
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="submit">{t('Search', 'ፈልግ')}</Button>
              <Button type="button" tone="ghost" onClick={() => { setDraft(blank); setF(blank); }}>
                {t('Clear', 'አጽዳ')}
              </Button>
            </div>
          </FilterBar>
          <ErrorText error={error} />
          {loading && !data ? (
            <Spinner />
          ) : (
            <>
              <p className="mb-2 text-xs text-stone-500">{t('Newest first, up to 200 entries.', 'አዲሱ መጀመሪያ፣ እስከ 200።')}</p>
              <Table
                head={['#', t('When', 'መቼ'), t('Action', 'ድርጊት'), t('Entity', 'አካል'), t('Actor', 'ፈጻሚ'), t('Change', 'ለውጥ')]}
                empty={t('No entries match.', 'የሚዛመድ ግቤት የለም።')}
                rows={(data ?? []).map((r) => [
                  <span key="i" className="font-mono text-xs">{r.id}</span>,
                  <span key="w" className="whitespace-nowrap text-xs">{date(r.at, lang, true)}</span>,
                  <span key="a" className="font-mono text-xs">{r.action}</span>,
                  <span key="e" className="text-xs">
                    {r.entityType}
                    {r.entityId && (
                      <button type="button" className="block font-mono text-brand-700 underline" title={r.entityId} onClick={() => { const n = { ...blank, entityType: r.entityType, entityId: r.entityId }; setDraft(n); setF(n); }}>
                        {shortId(r.entityId)}
                      </button>
                    )}
                  </span>,
                  r.actorId ? (
                    <button key="ac" type="button" className="font-mono text-xs text-brand-700 underline" title={r.actorId} onClick={() => { const n = { ...blank, actorId: r.actorId }; setDraft(n); setF(n); }}>
                      {r.actorName ?? shortId(r.actorId)}
                    </button>
                  ) : (
                    <span key="ac" className="text-xs text-stone-500">{t('system', 'ሥርዓት')}</span>
                  ),
                  r.before || r.after ? (
                    <details key="c" className="min-w-48">
                      <summary className="cursor-pointer text-xs text-brand-700">{t('Show', 'አሳይ')}</summary>
                      {r.before && (
                        <>
                          <p className="mt-1 text-xs text-stone-500">{t('Before', 'በፊት')}</p>
                          <JsonBlock value={r.before} max="max-h-48" />
                        </>
                      )}
                      {r.after && (
                        <>
                          <p className="mt-1 text-xs text-stone-500">{t('After', 'በኋላ')}</p>
                          <JsonBlock value={r.after} max="max-h-48" />
                        </>
                      )}
                      {r.ip && <p className="mt-1 text-xs text-stone-500">IP {r.ip}</p>}
                    </details>
                  ) : (
                    '—'
                  ),
                ])}
              />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
