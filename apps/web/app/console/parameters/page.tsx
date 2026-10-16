'use client';
import { useState } from 'react';
import { JsonBlock, Notice, shortId } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, Input, Modal, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function ParametersPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.parameters]}>
      <Parameters />
    </RequireAuth>
  );
}

function Parameters() {
  const { t, lang } = useLang();
  const { has, me } = useSession();
  const edit = has(...CONSOLE_ROLES.parametersEdit);
  const { data, error, loading, reload } = useApi<{ parameters: any[]; pending: any[] }>('/admin/parameters');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [ok, setOk] = useState<string | null>(null);

  const rows = (data?.parameters ?? []).filter((p) => (!category || p.category === category) && (!text || `${p.key} ${p.description}`.toLowerCase().includes(text.toLowerCase())));
  const pendingFor = (key: string) => (data?.pending ?? []).filter((c) => c.key === key);

  return (
    <>
      <PageTitle sub={t('Business rules the operator can change without a release. Every change is audited.', 'ያለ አዲስ ልቀት ሊቀየሩ የሚችሉ የንግድ ደንቦች።')}>{t('Parameters', 'መለኪያዎች')}</PageTitle>
      <div className="space-y-4">
        <Alert tone="info">{t('Operational parameters apply as soon as you save. Financial parameters wait until a second person (finance officer or super administrator) approves on the Approvals page.', 'የሥራ መለኪያዎች ወዲያውኑ ይተገበራሉ። የፋይናንስ መለኪያዎች ሁለተኛ ሰው እስኪያጸድቅ ይጠብቃሉ።')}</Alert>
        <Notice ok={ok} />
        <ErrorText error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Search', 'ፈልግ')}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="COMMISSION…" />
          </Field>
          <Field label={t('Category', 'ምድብ')}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: t('All', 'ሁሉም') }, { value: 'FINANCIAL', label: t('Financial', 'ፋይናንስ') }, { value: 'OPERATIONAL', label: t('Operational', 'የሥራ') }]} />
          </Field>
        </div>
        {loading && !data && <Spinner />}
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.key}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold">{p.key}</p>
                  <p className="text-sm text-stone-600">{p.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.category === 'FINANCIAL' ? 'amber' : 'gray'}>{p.category === 'FINANCIAL' ? t('financial', 'ፋይናንስ') : t('operational', 'የሥራ')}</Badge>
                  {edit && (
                    <Button tone="secondary" className="!min-h-9" onClick={() => setEditing(p)}>
                      {t('Request change', 'ለውጥ ጠይቅ')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <JsonBlock value={p.value} max="max-h-40" />
              </div>
              <p className="mt-1 text-xs text-stone-500">{t(`In effect since ${date(p.effectiveFrom, lang, true)}`, `ከ${date(p.effectiveFrom, lang, true)} ጀምሮ በሥራ ላይ`)}</p>
              {pendingFor(p.key).map((c) => (
                <div key={c.id} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
                  <p className="font-medium text-amber-900">{t('Pending change, waiting for a second approver', 'በሁለተኛ አጽዳቂ የሚጠብቅ ለውጥ')}</p>
                  <JsonBlock value={c.newValue} max="max-h-32" />
                  <p className="mt-1 text-xs">
                    {c.reason} · {c.requestedById === me?.id ? t('requested by you', 'በእርስዎ የተጠየቀ') : shortId(c.requestedById)} · {date(c.requestedAt, lang, true)}
                  </p>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </div>
      {editing && (
        <ChangeModal
          p={editing}
          onClose={() => setEditing(null)}
          onDone={(r) => {
            setEditing(null);
            setOk(r?.status === 'APPLIED' ? t(`${editing.key} changed. It applies now.`, `${editing.key} ተቀይሯል። አሁን ይተገበራል።`) : t(`Change to ${editing.key} requested. It waits for a second approver.`, `የ${editing.key} ለውጥ ተጠይቋል። ሁለተኛ አጽዳቂ ይጠብቃል።`));
            reload();
          }}
        />
      )}
    </>
  );
}

function ChangeModal({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: (r: any) => void }) {
  const { t } = useLang();
  const [raw, setRaw] = useState(JSON.stringify(p.value, null, 2));
  const [reason, setReason] = useState('');
  const a = useAction();
  let parsed: unknown;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parseError = (e as Error).message;
  }
  const unchanged = !parseError && JSON.stringify(parsed) === JSON.stringify(p.value);
  return (
    <Modal open onClose={onClose} title={p.key}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (parseError) return;
          const r = await a.run(() => post(`/admin/parameters/${p.key}`, { value: parsed, reason }));
          if (r) onDone(r);
        }}
      >
        <p className="text-sm text-stone-600">{p.description}</p>
        <Field label={t('New value (JSON)', 'አዲስ ዋጋ (JSON)')} hint={t('Keep the same type: a number stays a number, an object keeps its keys. Money is in santim; rates are fractions (0.05 is 5%).', 'ተመሳሳይ ዓይነት ይጠብቁ። ገንዘብ በሳንቲም ነው።')}>
          <Textarea rows={10} className="font-mono text-sm" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
        </Field>
        {parseError && <p className="text-xs text-red-700">{t('Not valid JSON', 'ትክክለኛ JSON አይደለም')}: {parseError}</p>}
        <Field label={t('Reason for the change', 'የለውጡ ምክንያት')}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        </Field>
        {p.category === 'FINANCIAL' ? (
          <Alert tone="warning">{t('Financial parameter: the change waits for a different person to approve it.', 'የፋይናንስ መለኪያ፦ ሌላ ሰው እስኪያጸድቅ ይጠብቃል።')}</Alert>
        ) : (
          <Alert tone="info">{t('Operational parameter: the change applies as soon as you save.', 'የሥራ መለኪያ፦ ወዲያውኑ ይተገበራል።')}</Alert>
        )}
        <ErrorText error={a.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" tone="secondary" onClick={onClose}>
            {t('Cancel', 'ይቅር')}
          </Button>
          <Button type="submit" busy={a.busy} disabled={!!parseError || unchanged || reason.trim().length < 3}>
            {p.category === 'FINANCIAL' ? t('Request approval', 'ማጽደቅ ጠይቅ') : t('Apply change', 'ለውጡን ተግብር')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
