'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, ROLE_OPTIONS, roleLabel, STAFF_ROLE_OPTIONS } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Button, Card, Checkbox, ErrorText, Field, Input, PageTitle, Select, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function StaffPage() {
  const { t } = useLang();
  const { has } = useSession();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.staff]}>
      <PageTitle>{t('Staff and announcements', 'ሠራተኞች እና ማስታወቂያዎች')}</PageTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        {has('SUPER_ADMIN') && <CreateStaff />}
        <Announce />
      </div>
    </RequireAuth>
  );
}

function CreateStaff() {
  const { t } = useLang();
  const blank = { phone: '', displayName: '', temporaryPassword: '', roles: [] as string[], safeguardingDesignated: false };
  const [f, setF] = useState(blank);
  const [created, setCreated] = useState<any>(null);
  const a = useAction();
  return (
    <Card title={t('Create a staff account', 'የሠራተኛ መለያ ፍጠር')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await a.run(() => post('/admin/staff', f));
          if (r) {
            setCreated(r);
            setF(blank);
          }
        }}
      >
        <Field label={t('Phone', 'ስልክ')}>
          <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required placeholder="09…" />
        </Field>
        <Field label={t('Name', 'ስም')}>
          <Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required minLength={2} />
        </Field>
        <Field label={t('Temporary password', 'ጊዜያዊ የይለፍ ቃል')} hint={t('At least 10 characters. Give it to the person privately; they set up two-step sign-in when they first sign in.', 'ቢያንስ 10 ቁምፊዎች። በግል ይስጡ።')}>
          <Input type="text" autoComplete="off" value={f.temporaryPassword} onChange={(e) => setF({ ...f, temporaryPassword: e.target.value })} required minLength={10} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">{t('Staff roles', 'የሠራተኛ ሚናዎች')}</legend>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {STAFF_ROLE_OPTIONS.map((r) => (
              <Checkbox key={r} label={roleLabel(r)} checked={f.roles.includes(r)} onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r) })} />
            ))}
          </div>
        </fieldset>
        <Checkbox label={t('Designated to handle confidential safeguarding cases', 'ሚስጥራዊ የጥበቃ ጉዳዮችን ለመያዝ የተመደበ')} checked={f.safeguardingDesignated} onChange={(e) => setF({ ...f, safeguardingDesignated: e.target.checked })} />
        <ErrorText error={a.error} />
        {created && (
          <Notice>
            {t('Account created.', 'መለያ ተፈጥሯል።')}{' '}
            <Link className="underline" href={`/console/users/${created.id}`}>
              {created.phone}
            </Link>
          </Notice>
        )}
        <Button type="submit" busy={a.busy} disabled={!f.roles.length}>
          {t('Create account', 'መለያ ፍጠር')}
        </Button>
      </form>
    </Card>
  );
}

function Announce() {
  const { t } = useLang();
  const blank = { role: '', subject: '', detail: '', sms: false };
  const [f, setF] = useState(blank);
  const [sent, setSent] = useState<number | null>(null);
  const a = useAction();
  return (
    <Card title={t('Send an announcement', 'ማስታወቂያ ላክ')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r: any = await a.run(() => post('/admin/announcements', { subject: f.subject, detail: f.detail, sms: f.sms, ...(f.role ? { role: f.role } : {}) }));
          if (r) {
            setSent(r.recipients);
            setF(blank);
          }
        }}
      >
        <Field label={t('Who receives it', 'ተቀባዮች')} hint={t('Active accounts only.', 'ንቁ መለያዎች ብቻ።')}>
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: '', label: t('Everyone', 'ሁሉም') }, ...ROLE_OPTIONS.map((r) => ({ value: r, label: roleLabel(r) }))]} />
        </Field>
        <Field label={t('Subject', 'ርዕስ')}>
          <Input value={f.subject} maxLength={160} onChange={(e) => setF({ ...f, subject: e.target.value })} required minLength={3} />
        </Field>
        <Field label={t('Message', 'መልእክት')}>
          <Textarea value={f.detail} maxLength={2000} onChange={(e) => setF({ ...f, detail: e.target.value })} required minLength={3} />
        </Field>
        <Checkbox label={t('Also send by SMS (keep it short)', 'በኤስኤምኤስም ላክ (አጭር ያድርጉት)')} checked={f.sms} onChange={(e) => setF({ ...f, sms: e.target.checked })} />
        <ErrorText error={a.error} />
        {sent !== null && <Notice ok={t(`Sent to ${sent} people.`, `ለ${sent} ሰዎች ተልኳል።`)} />}
        <Button type="submit" busy={a.busy}>
          {t('Send', 'ላክ')}
        </Button>
      </form>
    </Card>
  );
}
