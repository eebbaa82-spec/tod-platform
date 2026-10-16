'use client';
import { useState } from 'react';
import { birrValue, Notice, ReasonButton } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Badge, Button, Card, Checkbox, ErrorText, Field, Input, Modal, PageTitle, Select, Spinner, Table, Textarea, useAction } from '@/components/ui';
import { post, put } from '@/lib/api';
import { etb, humanise, shortDate, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function CataloguePage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.catalogue]}>
      <Catalogue />
    </RequireAuth>
  );
}

function Catalogue() {
  const { t, pick } = useLang();
  const { has } = useSession();
  const edit = has(...CONSOLE_ROLES.catalogueEdit);
  const { data, error, loading, reload } = useApi<any[]>('/catalogue/admin/packages');
  const { data: areas } = useApi<any[]>('/catalogue/service-areas');
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'revise'; pkg: any } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const ext = useAction();
  const done = (m: string) => {
    setOk(m);
    reload();
  };

  return (
    <>
      <PageTitle
        sub={t('Every change creates a new version. Assignments already agreed keep the version they were made with.', 'እያንዳንዱ ለውጥ አዲስ እትም ይፈጥራል። የተስማሙ ሥራዎች የቀድሞ እትማቸውን ይይዛሉ።')}
        actions={edit ? <Button onClick={() => setForm({ mode: 'create' })}>{t('New package', 'አዲስ ጥቅል')}</Button> : undefined}
      >
        {t('Service catalogue', 'የአገልግሎት ዝርዝር')}
      </PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        <ErrorText error={error ?? ext.error} />
        <Card>
          {loading && !data ? (
            <Spinner />
          ) : (
            <Table
              head={[t('Code', 'ኮድ'), t('Package', 'ጥቅል'), t('Area', 'ዘርፍ'), t('Price band', 'የዋጋ ክልል'), t('Standard', 'መደበኛ'), t('Min tier', 'ዝቅተኛ ደረጃ'), t('Version', 'እትም'), t('Status', 'ሁኔታ'), ...(edit ? [''] : [])]}
              empty={t('No packages yet.', 'ገና ጥቅል የለም።')}
              rows={(data ?? []).map((p) => {
                const v = p.currentVersion;
                return [
                  <span key="c" className="whitespace-nowrap font-mono text-xs">{p.code}</span>,
                  <span key="t">
                    {pick(v, 'title')}
                    <span className="block text-xs text-stone-500">{t(`${v?.turnaroundDays} days · ${v?.revisionLimit} revisions`, `${v?.turnaroundDays} ቀናት · ${v?.revisionLimit} ክለሳዎች`)}</span>
                  </span>,
                  pick(p.serviceArea, 'name'),
                  <span key="b" className="whitespace-nowrap">{etb(v?.priceMin)} – {etb(v?.priceMax)}</span>,
                  <span key="s" className="whitespace-nowrap">{etb(v?.priceStandard)}</span>,
                  humanise(v?.minTier),
                  <span key="v" className="whitespace-nowrap">v{v?.version} · {shortDate(v?.createdAt)}</span>,
                  <span key="st" className="flex flex-wrap gap-1">
                    <Badge tone={p.status === 'ACTIVE' ? 'green' : 'gray'}>{humanise(p.status)}</Badge>
                    {p.extensionCategory && <Badge tone="blue">{t('extension', 'ተጨማሪ')}</Badge>}
                  </span>,
                  ...(edit
                    ? [
                        <div key="x" className="flex flex-wrap gap-1">
                          <Button tone="secondary" className="!min-h-9" onClick={() => setForm({ mode: 'revise', pkg: p })}>
                            {t('Revise', 'አሻሽል')}
                          </Button>
                          {p.status === 'ACTIVE' ? (
                            <ReasonButton label={t('Retire', 'አቋርጥ')} tone="danger" title={t(`Retire ${p.code}`, `${p.code} አቋርጥ`)} onSubmit={async (reason) => {
                              await post(`/catalogue/admin/packages/${p.code}/retire`, { reason });
                              done(t(`${p.code} retired. It no longer appears to clients.`, `${p.code} ተቋርጧል።`));
                            }} />
                          ) : (
                            <ReasonButton label={t('Reactivate', 'እንደገና አንቃ')} title={t(`Reactivate ${p.code}`, `${p.code} እንደገና አንቃ`)} onSubmit={async (reason) => {
                              await post(`/catalogue/admin/packages/${p.code}/reactivate`, { reason });
                              done(t(`${p.code} is active again.`, `${p.code} እንደገና ንቁ ነው።`));
                            }} />
                          )}
                          <Button
                            tone="ghost"
                            className="!min-h-9"
                            busy={ext.busy}
                            onClick={async () => {
                              const r = await ext.run(() => post(`/catalogue/admin/packages/${p.code}/extension`, { extensionCategory: !p.extensionCategory }));
                              if (r) done(p.extensionCategory ? t(`${p.code} is now in the main catalogue.`, `${p.code} አሁን በዋናው ዝርዝር ውስጥ ነው።`) : t(`${p.code} is now an extension package, hidden from the public catalogue.`, `${p.code} አሁን ተጨማሪ ጥቅል ነው።`));
                            }}
                          >
                            {p.extensionCategory ? t('Move to main', 'ወደ ዋና') : t('Mark extension', 'ተጨማሪ አድርግ')}
                          </Button>
                        </div>,
                      ]
                    : []),
                ];
              })}
            />
          )}
          <p className="mt-3 text-xs text-stone-500">{t('Extension packages stay hidden from the public catalogue until moved to the main catalogue.', 'ተጨማሪ ጥቅሎች ወደ ዋናው እስኪዛወሩ ድረስ ከሕዝብ ዝርዝር ይደበቃሉ።')}</p>
        </Card>
      </div>
      {form && (
        <PackageForm
          mode={form.mode}
          pkg={form.mode === 'revise' ? form.pkg : null}
          areas={areas ?? []}
          onClose={() => setForm(null)}
          onDone={(m) => {
            setForm(null);
            done(m);
          }}
        />
      )}
    </>
  );
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function PackageForm({ mode, pkg, areas, onClose, onDone }: { mode: 'create' | 'revise'; pkg: any; areas: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const { t, pick } = useLang();
  const v = pkg?.currentVersion ?? {};
  const [f, setF] = useState({
    code: pkg?.code ?? '',
    serviceAreaCode: pkg?.serviceArea?.code ?? '',
    extensionCategory: !!pkg?.extensionCategory,
    titleEn: v.titleEn ?? '',
    titleAm: v.titleAm ?? '',
    scopeEn: v.scopeEn ?? '',
    scopeAm: v.scopeAm ?? '',
    exclusionsEn: v.exclusionsEn ?? '',
    exclusionsAm: v.exclusionsAm ?? '',
    deliverableEn: v.deliverableEn ?? '',
    deliverableAm: v.deliverableAm ?? '',
    checklistEn: (v.checklistEn ?? []).join('\n'),
    checklistAm: (v.checklistAm ?? []).join('\n'),
    turnaroundDays: String(v.turnaroundDays ?? 5),
    revisionLimit: String(v.revisionLimit ?? 2),
    minTier: v.minTier ?? 'ENTRY',
    priceMin: birrValue(v.priceMin),
    priceStandard: birrValue(v.priceStandard),
    priceMax: birrValue(v.priceMax),
  });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ce = lines(f.checklistEn);
  const ca = lines(f.checklistAm);
  const pMin = toSantim(f.priceMin || 0);
  const pStd = toSantim(f.priceStandard || 0);
  const pMax = toSantim(f.priceMax || 0);
  const bandOk = pMin >= 100 && pMin <= pStd && pStd <= pMax;
  const checklistOk = ce.length > 0 && ce.length === ca.length;

  const pair = (label: string, en: keyof typeof f, am: keyof typeof f, area = true, max = 2000) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} (English)`}>{area ? <Textarea rows={3} maxLength={max} value={f[en] as string} onChange={set(en)} required /> : <Input maxLength={120} value={f[en] as string} onChange={set(en)} required minLength={3} />}</Field>
      <Field label={`${label} (አማርኛ)`}>{area ? <Textarea rows={3} maxLength={max} value={f[am] as string} onChange={set(am)} required /> : <Input maxLength={120} value={f[am] as string} onChange={set(am)} required minLength={2} />}</Field>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={mode === 'create' ? t('New package', 'አዲስ ጥቅል') : t(`Revise ${pkg.code} (creates v${(v.version ?? 0) + 1})`, `${pkg.code} አሻሽል`)}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const content = {
            titleEn: f.titleEn, titleAm: f.titleAm, scopeEn: f.scopeEn, scopeAm: f.scopeAm, exclusionsEn: f.exclusionsEn, exclusionsAm: f.exclusionsAm,
            deliverableEn: f.deliverableEn, deliverableAm: f.deliverableAm, checklistEn: ce, checklistAm: ca,
            turnaroundDays: Number(f.turnaroundDays), revisionLimit: Number(f.revisionLimit), minTier: f.minTier, priceMin: pMin, priceStandard: pStd, priceMax: pMax,
          };
          const r = await a.run(() =>
            mode === 'create'
              ? post('/catalogue/admin/packages', { ...content, code: f.code.trim(), serviceAreaCode: f.serviceAreaCode, extensionCategory: f.extensionCategory })
              : put(`/catalogue/admin/packages/${pkg.code}`, content),
          );
          if (r) onDone(mode === 'create' ? t(`Package ${f.code} created.`, `ጥቅል ${f.code} ተፈጥሯል።`) : t(`${pkg.code} revised to a new version.`, `${pkg.code} አዲስ እትም ተፈጥሯል።`));
        }}
      >
        {mode === 'create' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Code', 'ኮድ')} hint={t('Short and permanent, e.g. LOGO-BASIC', 'አጭር እና ቋሚ')}>
                <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required minLength={3} maxLength={40} />
              </Field>
              <Field label={t('Service area', 'የአገልግሎት ዘርፍ')}>
                <Select value={f.serviceAreaCode} onChange={set('serviceAreaCode')} required options={[{ value: '', label: t('Choose…', 'ይምረጡ…') }, ...areas.map((s) => ({ value: s.code, label: pick(s, 'name') }))]} />
              </Field>
            </div>
            <Checkbox label={t('Extension package (hidden from the public catalogue)', 'ተጨማሪ ጥቅል (ከሕዝብ ዝርዝር የተደበቀ)')} checked={f.extensionCategory} onChange={(e) => setF({ ...f, extensionCategory: e.target.checked })} />
          </>
        )}
        {pair(t('Title', 'ርዕስ'), 'titleEn', 'titleAm', false)}
        {pair(t('Scope', 'ወሰን'), 'scopeEn', 'scopeAm')}
        {pair(t('Exclusions', 'የማይካተቱ'), 'exclusionsEn', 'exclusionsAm')}
        {pair(t('Deliverable', 'የሚቀርበው'), 'deliverableEn', 'deliverableAm', true, 1000)}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Acceptance checklist (English), one per line', 'የመቀበያ ዝርዝር (English)')}>
            <Textarea rows={4} value={f.checklistEn} onChange={set('checklistEn')} required />
          </Field>
          <Field label="የመቀበያ ዝርዝር (አማርኛ)፣ በየመስመሩ አንድ">
            <Textarea rows={4} value={f.checklistAm} onChange={set('checklistAm')} required />
          </Field>
        </div>
        {!checklistOk && <p className="text-xs text-red-700">{t(`Give the same number of checklist items in both languages (now ${ce.length} and ${ca.length}).`, `በሁለቱም ቋንቋዎች እኩል ቁጥር ይስጡ (${ce.length} እና ${ca.length})።`)}</p>}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Turnaround (days)', 'የማስረከቢያ ጊዜ (ቀናት)')}>
            <Input type="number" min={1} max={90} value={f.turnaroundDays} onChange={set('turnaroundDays')} required />
          </Field>
          <Field label={t('Revisions', 'ክለሳዎች')}>
            <Input type="number" min={0} max={10} value={f.revisionLimit} onChange={set('revisionLimit')} required />
          </Field>
          <Field label={t('Minimum tier', 'ዝቅተኛ ደረጃ')}>
            <Select value={f.minTier} onChange={set('minTier')} options={['ENTRY', 'INTERMEDIATE', 'EXPERT'].map((x) => ({ value: x, label: humanise(x) }))} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Lowest price (birr)', 'ዝቅተኛ ዋጋ (ብር)')}>
            <Input type="number" min={1} step="0.01" value={f.priceMin} onChange={set('priceMin')} required />
          </Field>
          <Field label={t('Standard price (birr)', 'መደበኛ ዋጋ (ብር)')}>
            <Input type="number" min={1} step="0.01" value={f.priceStandard} onChange={set('priceStandard')} required />
          </Field>
          <Field label={t('Highest price (birr)', 'ከፍተኛ ዋጋ (ብር)')}>
            <Input type="number" min={1} step="0.01" value={f.priceMax} onChange={set('priceMax')} required />
          </Field>
        </div>
        {!bandOk && (f.priceMin || f.priceMax) && <p className="text-xs text-red-700">{t('The standard price must sit within the band (lowest ≤ standard ≤ highest), and at least 1 birr.', 'መደበኛ ዋጋው በክልሉ ውስጥ መሆን አለበት።')}</p>}
        <p className="text-xs text-stone-500">{t('Talents can accept the standard price directly or propose within the band.', 'ተሰጥኦዎች መደበኛውን ዋጋ መቀበል ወይም በክልሉ ውስጥ ማቅረብ ይችላሉ።')}</p>
        <ErrorText error={a.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" tone="secondary" onClick={onClose}>
            {t('Cancel', 'ይቅር')}
          </Button>
          <Button type="submit" busy={a.busy} disabled={!bandOk || !checklistOk}>
            {mode === 'create' ? t('Create package', 'ጥቅል ፍጠር') : t('Save new version', 'አዲስ እትም አስቀምጥ')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
