'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KV, Notice, ReasonButton, ROLE_OPTIONS, roleLabel, shortId, StandInBanner, useDevStatus } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Badge, Button, Card, Checkbox, ErrorText, Field, Input, PageTitle, Select, Spinner, StatusBadge, Table, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function UserDetailPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.users]}>
      <UserDetail />
    </RequireAuth>
  );
}

const yn = (v: boolean | null | undefined, t: (e: string, a: string) => string) => (v === true ? t('Yes', 'አዎ') : v === false ? t('No', 'አይ') : t('Not stated', 'አልተገለጸም'));

function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { has } = useSession();
  const { data: u, error, loading, reload } = useApi<any>(`/admin/users/${id}`);
  const [ok, setOk] = useState<string | null>(null);
  const dev = useDevStatus();

  if (loading && !u) return <Spinner />;
  if (error && !u) return <ErrorText error={error} />;
  if (!u) return null;

  const done = (msg: string) => {
    setOk(msg);
    reload();
  };
  const tp = u.talent;
  const inclusion = tp && tp.inclusion !== 'restricted' ? tp.inclusion : null;

  return (
    <>
      <PageTitle
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {u.phone} · <StatusBadge status={u.status} /> {u.roles.map((r: string) => <Badge key={r}>{roleLabel(r)}</Badge>)}
            {u.safeguardingDesignated && <Badge tone="blue">{t('safeguarding designated', 'ለጥበቃ የተመደበ')}</Badge>}
          </span>
        }
        actions={
          has('PLATFORM_ADMIN', 'SUPER_ADMIN') ? (
            u.status === 'SUSPENDED' ? (
              <ReasonButton label={t('Reinstate', 'መልስ')} title={t('Reinstate account', 'መለያውን መልስ')} onSubmit={async (reason) => {
                await post(`/admin/users/${id}/reinstate`, { reason });
                done(t('Account reinstated.', 'መለያው ተመልሷል።'));
              }} />
            ) : (
              <ReasonButton tone="danger" label={t('Suspend', 'አግድ')} title={t('Suspend account', 'መለያውን አግድ')} onSubmit={async (reason) => {
                await post(`/admin/users/${id}/suspend`, { reason });
                done(t('Account suspended. The user was told by SMS.', 'መለያው ታግዷል።'));
              }}>
                <p className="text-sm text-stone-600">{t('The user is signed out of new actions, their profile is hidden and they receive an SMS.', 'ተጠቃሚው በኤስኤምኤስ ይነገረዋል፣ መገለጫው ይደበቃል።')}</p>
              </ReasonButton>
            )
          ) : undefined
        }
      >
        {u.displayName}
      </PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        {u.suspensionReason && <ErrorText error={t(`Suspended: ${u.suspensionReason}`, `ታግዷል፦ ${u.suspensionReason}`)} />}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('Account', 'መለያ')}>
            <KV
              items={[
                [t('User id', 'መለያ ቁጥር'), <code key="i" className="text-xs">{u.id}</code>],
                [t('Language', 'ቋንቋ'), u.language === 'am' ? 'አማርኛ' : 'English'],
                [t('Joined', 'የተቀላቀለ'), date(u.createdAt, lang)],
                [t('Last sign-in', 'መጨረሻ የገባበት'), date(u.lastSignInAt, lang, true)],
                [t('Two-step sign-in', 'ባለሁለት ደረጃ መግቢያ'), u.mfaEnabled ? t('On', 'በርቷል') : t('Off', 'ጠፍቷል')],
                [t('Registered by an agent', 'በወኪል የተመዘገበ'), u.assistedById ? shortId(u.assistedById) : t('No', 'አይ')],
                [t('Assignments', 'ሥራዎች'), t(`${u.counts.asClient} as client, ${u.counts.asTalent} as talent`, `${u.counts.asClient} እንደ ደንበኛ፣ ${u.counts.asTalent} እንደ ተሰጥኦ`)],
                [t('Tickets', 'ትኬቶች'), u.counts.tickets],
              ]}
            />
          </Card>
          <Card title={t('Identity (Fayda)', 'ማንነት (ፋይዳ)')}>
            <KV
              items={[
                [t('Status', 'ሁኔታ'), <StatusBadge key="s" status={u.identity.status} />],
                [t('Verified name', 'የተረጋገጠ ስም'), u.identity.verifiedName],
                [t('FAN (masked)', 'FAN (የተሸፈነ)'), u.identity.masked],
                [t('Sex', 'ጾታ'), u.identity.sex ? humanise(u.identity.sex) : null],
                [t('Date of birth', 'የትውልድ ቀን'), u.identity.dateOfBirth ? date(u.identity.dateOfBirth, lang) : null],
                [t('Verified at', 'የተረጋገጠበት'), date(u.identity.verifiedAt, lang, true)],
              ]}
            />
          </Card>
        </div>

        <Card title={t('Consents', 'ስምምነቶች')}>
          <Table
            head={[t('Document', 'ሰነድ'), t('Version', 'እትም'), t('Accepted', 'የተቀበለበት'), t('Withdrawn', 'የተሰረዘበት'), t('Recorded by', 'የመዘገበው')]}
            empty={t('No consents recorded.', 'የተመዘገበ ስምምነት የለም።')}
            rows={u.consents.map((c: any) => [humanise(c.document), c.version, date(c.acceptedAt, lang), c.withdrawnAt ? date(c.withdrawnAt, lang) : '—', c.recordedById ? t(`Agent ${shortId(c.recordedById)}`, `ወኪል ${shortId(c.recordedById)}`) : t('Self', 'ራሱ')])}
          />
        </Card>

        {tp && (
          <Card title={t('Talent profile', 'የተሰጥኦ መገለጫ')}>
            <div className="grid gap-4 lg:grid-cols-2">
              <KV
                items={[
                  [t('Headline', 'ርዕስ'), tp.headline],
                  [t('Vetting', 'ግምገማ'), <StatusBadge key="v" status={tp.vettingStatus} />],
                  [t('Published', 'የታተመ'), tp.publishedAt ? date(tp.publishedAt, lang) : t('Not published', 'አልታተመም')],
                  [t('Visibility', 'ታይነት'), humanise(tp.visibility)],
                  [t('Payout', 'ክፍያ መቀበያ'), tp.payout.channel ? `${humanise(tp.payout.channel)} ${tp.payout.masked ?? ''}` : t('Not set', 'አልተዘጋጀም')],
                  [t('Payout account name', 'የሂሳብ ስም'), tp.payout.accountName ? `${tp.payout.accountName} ${tp.payout.nameVerified ? t('(matches identity)', '(ከማንነት ጋር ይዛመዳል)') : t('(not matched)', '(አልተዛመደም)')}` : null],
                ]}
              />
              <div>
                <p className="mb-2 text-sm font-medium">{t('Tiers', 'ደረጃዎች')}</p>
                <Table head={[t('Service area', 'የአገልግሎት ዘርፍ'), t('Tier', 'ደረጃ'), t('Test score', 'የፈተና ውጤት')]} empty={t('No tiers assigned.', 'ደረጃ አልተሰጠም።')} rows={tp.tiers.map((x: any) => [x.serviceArea, humanise(x.tier), x.testScore ?? '—'])} />
              </div>
            </div>
            {inclusion && (
              <div className="mt-4 rounded-lg border border-stone-200 p-3">
                <p className="mb-2 text-sm font-medium">{t('Inclusion (restricted; never shown publicly)', 'አካታችነት (የተገደበ፤ በይፋ አይታይም)')}</p>
                <KV
                  items={[
                    [t('Disability declared', 'አካል ጉዳት የተገለጸ'), yn(inclusion.disability, t)],
                    [t('Disability confirmed', 'አካል ጉዳት የተረጋገጠ'), inclusion.disabilityConfirmed ? t('Yes', 'አዎ') : t('No', 'አይ')],
                    [t('Displaced', 'የተፈናቀለ'), yn(inclusion.displaced, t)],
                    [t('Other marginalised', 'ሌላ የተገለለ'), yn(inclusion.otherMarginalised, t)],
                  ]}
                />
                {has('VETTING_OFFICER', 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN') && <DisabilityForm userId={id} current={inclusion} onDone={done} />}
              </div>
            )}
          </Card>
        )}

        {u.client && <ClientCard userId={id} c={u.client} onDone={done} />}

        {has('SUPER_ADMIN') && <RolesForm userId={id} roles={u.roles} designated={u.safeguardingDesignated} onDone={done} />}

        {dev.enabled && has('VETTING_OFFICER', 'SUPPORT_AGENT', 'SUPER_ADMIN') && (
          <StandInBanner>
            <p className="mb-3 text-sm text-amber-900">
              {t(
                "These forms stand in for the developer's Fayda identity and vetting modules while they are being built. They call the same integration points those modules will call, and they are switched off in production.",
                'እነዚህ ቅጾች የፋይዳ ማንነት እና የግምገማ ሞጁሎች እስኪሠሩ ድረስ ምትክ ናቸው። በምርት አካባቢ ይጠፋሉ።',
              )}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <IdentityStandIn userId={id} u={u} onDone={done} />
              {tp && has('VETTING_OFFICER', 'SUPER_ADMIN') && <VettingStandIn userId={id} tiers={tp.tiers} onDone={done} />}
            </div>
          </StandInBanner>
        )}
      </div>
    </>
  );
}

function DisabilityForm({ userId, current, onDone }: { userId: string; current: any; onDone: (m: string) => void }) {
  const { t } = useLang();
  const [confirmed, setConfirmed] = useState(!current.disabilityConfirmed);
  const [note, setNote] = useState('');
  const a = useAction();
  return (
    <form
      className="mt-3 space-y-2 border-t border-stone-200 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(() => post(`/admin/users/${userId}/disability`, { confirmed, note }));
        if (r) {
          setNote('');
          onDone(confirmed ? t('Disability confirmed. The inclusive commission rate now applies.', 'አካል ጉዳት ተረጋግጧል።') : t('Disability confirmation removed.', 'ማረጋገጫው ተነስቷል።'));
        }
      }}
    >
      <p className="text-sm font-medium">{t('Disability confirmation', 'የአካል ጉዳት ማረጋገጫ')}</p>
      <Select value={confirmed ? 'yes' : 'no'} onChange={(e) => setConfirmed(e.target.value === 'yes')} options={[{ value: 'yes', label: t('Confirm the declared disability', 'የተገለጸውን አረጋግጥ') }, { value: 'no', label: t('Remove confirmation', 'ማረጋገጫውን አንሳ') }]} />
      <Field label={t('Note: what evidence you saw', 'ማስታወሻ፦ ያዩት ማስረጃ')}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} />
      </Field>
      <ErrorText error={a.error} />
      <Button type="submit" tone="secondary" busy={a.busy} disabled={note.trim().length < 3 || (confirmed && current.disability !== true)}>
        {t('Save', 'አስቀምጥ')}
      </Button>
      {confirmed && current.disability !== true && <p className="text-xs text-stone-500">{t('The talent has not declared a disability.', 'ተሰጥኦው አካል ጉዳት አልገለጸም።')}</p>}
    </form>
  );
}

function ClientCard({ userId, c, onDone }: { userId: string; c: any; onDone: (m: string) => void }) {
  const { t, lang } = useLang();
  const { has } = useSession();
  return (
    <Card
      title={t('Client profile', 'የደንበኛ መገለጫ')}
      actions={
        has('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN') && !c.levelConfirmedAt ? (
          <ReasonButton label={t('Confirm client level', 'ደረጃውን አረጋግጥ')} title={t('Confirm client level', 'የደንበኛ ደረጃ ማረጋገጫ')} fieldLabel={t('Note: documents or visit that support the level', 'ማስታወሻ፦ ደረጃውን የሚደግፉ ሰነዶች')} onSubmit={async (note) => {
            await post(`/clients/${userId}/confirm-level`, { note });
            onDone(t('Client level confirmed.', 'የደንበኛ ደረጃ ተረጋግጧል።'));
          }}>
            <p className="text-sm text-stone-600">{t(`Confirm that this client qualifies as ${humanise(c.level)}. Until confirmed, a verified enterprise is treated as a basic enterprise for value limits.`, `ይህ ደንበኛ ${humanise(c.level)} መሆኑን ያረጋግጡ።`)}</p>
          </ReasonButton>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <KV
          items={[
            [t('Level', 'ደረጃ'), <span key="l">{humanise(c.level)} {c.levelConfirmedAt ? <Badge tone="green">{t('confirmed', 'የተረጋገጠ')}</Badge> : <Badge tone="amber">{t('not confirmed', 'ያልተረጋገጠ')}</Badge>}</span>],
            [t('Confirmed', 'የተረጋገጠበት'), c.levelConfirmedAt ? `${date(c.levelConfirmedAt, lang)} · ${shortId(c.levelConfirmedById)}` : null],
            [t('Enterprise', 'ድርጅት'), c.enterpriseName],
            [t('Trade licence', 'የንግድ ፈቃድ'), c.tradeLicenceNo],
            [t('TIN', 'ግብር ከፋይ ቁጥር'), c.tin],
            [t('Sector', 'ዘርፍ'), c.sector],
          ]}
        />
        <KV
          items={[
            [t('Location', 'አድራሻ'), [c.subCity, c.city].filter(Boolean).join(', ')],
            [t('Staff size', 'የሠራተኞች ብዛት'), c.staffSize],
            [t('Women-led', 'በሴቶች የሚመራ'), yn(c.womenLed, t)],
            [t('Youth-led', 'በወጣቶች የሚመራ'), yn(c.youthLed, t)],
            [t('Owned by a person with disability', 'በአካል ጉዳተኛ የተያዘ'), yn(c.pwdOwned, t)],
            [t('Referral', 'የመጣበት'), `${humanise(c.referralSource)}${c.referralDetail ? ` · ${c.referralDetail}` : ''}`],
            [t('Activity evidence', 'የሥራ ማስረጃ'), c.activityEvidence],
            [t('Evidence file', 'የማስረጃ ፋይል'), c.evidenceFileId ? <a key="f" className="text-brand-700 hover:underline" href={`/api/files/${c.evidenceFileId}`} target="_blank" rel="noreferrer">{t('Open', 'ክፈት')}</a> : null],
          ]}
        />
      </div>
    </Card>
  );
}

function RolesForm({ userId, roles, designated, onDone }: { userId: string; roles: string[]; designated: boolean; onDone: (m: string) => void }) {
  const { t } = useLang();
  const [sel, setSel] = useState<string[]>(roles);
  const [sg, setSg] = useState(designated);
  const a = useAction();
  useEffect(() => {
    setSel(roles);
    setSg(designated);
  }, [roles, designated]);
  return (
    <Card title={t('Roles and safeguarding designation', 'ሚናዎች እና የጥበቃ ምደባ')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await a.run(() => post(`/admin/users/${userId}/roles`, { roles: sel, safeguardingDesignated: sg }));
          if (r) onDone(t('Roles saved.', 'ሚናዎች ተቀምጠዋል።'));
        }}
      >
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_OPTIONS.map((r) => (
            <Checkbox key={r} label={roleLabel(r)} checked={sel.includes(r)} onChange={(e) => setSel(e.target.checked ? [...sel, r] : sel.filter((x) => x !== r))} />
          ))}
        </div>
        <Checkbox
          label={t('Designated to handle confidential safeguarding cases (harassment, exploitation, discrimination, fraud)', 'ሚስጥራዊ የጥበቃ ጉዳዮችን ለመያዝ የተመደበ')}
          checked={sg}
          onChange={(e) => setSg(e.target.checked)}
        />
        <p className="text-xs text-stone-500">{t('Staff roles need two-step sign-in. Changes are recorded in the audit log.', 'የሠራተኛ ሚናዎች ባለሁለት ደረጃ መግቢያ ይፈልጋሉ።')}</p>
        <ErrorText error={a.error} />
        <Button type="submit" busy={a.busy} disabled={!sel.length}>
          {t('Save roles', 'ሚናዎችን አስቀምጥ')}
        </Button>
      </form>
    </Card>
  );
}

function IdentityStandIn({ userId, u, onDone }: { userId: string; u: any; onDone: (m: string) => void }) {
  const { t } = useLang();
  const [f, setF] = useState({ status: 'VERIFIED', verifiedName: u.identity.verifiedName ?? u.displayName, sex: u.identity.sex ?? '', dateOfBirth: u.identity.dateOfBirth?.slice(0, 10) ?? '', fan: '' });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="space-y-3 rounded-lg bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, string> = { status: f.status };
        if (f.verifiedName) body.verifiedName = f.verifiedName;
        if (f.sex) body.sex = f.sex;
        if (f.dateOfBirth) body.dateOfBirth = f.dateOfBirth;
        if (f.fan) body.fan = f.fan;
        const r: any = await a.run(() => post(`/dev/identity/${userId}`, body));
        if (r) onDone(t(`Identity result applied: ${r.identityStatus}.`, `የማንነት ውጤት ተተግብሯል፦ ${r.identityStatus}።`));
      }}
    >
      <p className="font-semibold">{t('Set identity result', 'የማንነት ውጤት አዘጋጅ')}</p>
      <p className="text-xs text-stone-600">{t('Stands in for the Fayda eKYC check.', 'ለፋይዳ ማረጋገጫ ምትክ።')}</p>
      <Field label={t('Result', 'ውጤት')}>
        <Select value={f.status} onChange={set('status')} options={['VERIFIED', 'PROVISIONAL', 'FAILED'].map((s) => ({ value: s, label: humanise(s) }))} />
      </Field>
      <Field label={t('Verified name', 'የተረጋገጠ ስም')}>
        <Input value={f.verifiedName} onChange={set('verifiedName')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Sex', 'ጾታ')}>
          <Select value={f.sex} onChange={set('sex')} options={[{ value: '', label: '—' }, { value: 'FEMALE', label: t('Female', 'ሴት') }, { value: 'MALE', label: t('Male', 'ወንድ') }]} />
        </Field>
        <Field label={t('Date of birth', 'የትውልድ ቀን')}>
          <Input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} />
        </Field>
      </div>
      <Field label="FAN" hint={t('Optional. A test number is made from the phone if left empty.', 'አማራጭ።')}>
        <Input value={f.fan} onChange={set('fan')} inputMode="numeric" />
      </Field>
      <ErrorText error={a.error} />
      <Button type="submit" tone="secondary" busy={a.busy}>
        {t('Apply identity result', 'ውጤቱን ተግብር')}
      </Button>
    </form>
  );
}

function VettingStandIn({ userId, tiers, onDone }: { userId: string; tiers: { serviceArea: string; tier: string; testScore: number | null }[]; onDone: (m: string) => void }) {
  const { t, pick } = useLang();
  const { data: areas } = useApi<any[]>('/catalogue/service-areas');
  const [status, setStatus] = useState('APPROVED');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Record<string, { on: boolean; tier: string; score: string }>>({});
  const a = useAction();
  useEffect(() => {
    if (!areas) return;
    const init: typeof rows = {};
    for (const ar of areas) {
      const cur = tiers.find((x) => x.serviceArea === ar.code);
      init[ar.code] = { on: !!cur, tier: cur?.tier ?? 'ENTRY', score: cur?.testScore != null ? String(cur.testScore) : '' };
    }
    setRows(init);
  }, [areas, tiers]);
  return (
    <form
      className="space-y-3 rounded-lg bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const list = Object.entries(rows)
          .filter(([, r]) => r.on)
          .map(([code, r]) => ({ serviceAreaCode: code, tier: r.tier, ...(r.score !== '' ? { testScore: Number(r.score) } : {}) }));
        const r = await a.run(() => post(`/dev/vetting/${userId}`, { status, tiers: list, ...(note ? { note } : {}) }));
        if (r) onDone(t(`Vetting outcome applied: ${status}.`, `የግምገማ ውጤት ተተግብሯል፦ ${status}።`));
      }}
    >
      <p className="font-semibold">{t('Set vetting outcome', 'የግምገማ ውጤት አዘጋጅ')}</p>
      <p className="text-xs text-stone-600">{t('Stands in for the vetting module (skills tests and interviews).', 'ለግምገማ ሞጁል ምትክ።')}</p>
      <Field label={t('Outcome', 'ውጤት')}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={['IN_PROGRESS', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: humanise(s) }))} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('Tiers by service area', 'ደረጃዎች በአገልግሎት ዘርፍ')}</p>
        {(areas ?? []).map((ar) => {
          const r = rows[ar.code];
          if (!r) return null;
          const upd = (p: Partial<typeof r>) => setRows({ ...rows, [ar.code]: { ...r, ...p } });
          return (
            <div key={ar.code} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <Checkbox label={`${pick(ar, 'name')} (${ar.code})`} checked={r.on} onChange={(e) => upd({ on: e.target.checked })} />
              <Select aria-label={t('Tier', 'ደረጃ')} className="!w-36" disabled={!r.on} value={r.tier} onChange={(e) => upd({ tier: e.target.value })} options={['ENTRY', 'INTERMEDIATE', 'EXPERT'].map((x) => ({ value: x, label: humanise(x) }))} />
              <Input aria-label={t('Test score', 'የፈተና ውጤት')} className="!w-24" disabled={!r.on} type="number" min={0} max={100} placeholder={t('Score', 'ውጤት')} value={r.score} onChange={(e) => upd({ score: e.target.value })} />
            </div>
          );
        })}
      </div>
      <Field label={t('Note (optional)', 'ማስታወሻ (አማራጭ)')}>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={a.error} />
      <Button type="submit" tone="secondary" busy={a.busy}>
        {t('Apply vetting outcome', 'ውጤቱን ተግብር')}
      </Button>
      <p className="text-xs text-stone-500">
        <Link className="underline" href="/console/catalogue">{t('Service areas are listed in the catalogue.', 'የአገልግሎት ዘርፎች በዝርዝሩ ይገኛሉ።')}</Link>
      </p>
    </form>
  );
}
