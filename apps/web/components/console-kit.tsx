'use client';
import { useEffect, useMemo, useState } from 'react';
import { get } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Alert, Button, ErrorText, Field, Modal, Textarea, useAction } from './ui';

// Builds a query string from the non-empty values.
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}

export const shortId = (id: string | null | undefined) => (id ? `…${id.slice(-6)}` : '—');

// Test stand-ins answer only outside production; GET /dev/status fails otherwise.
let devCache: Promise<boolean> | null = null;
const DEV_ROLES = ['VETTING_OFFICER', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN'];
export function useDevStatus() {
  const { has, me } = useSession();
  const allowed = has(...DEV_ROLES);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!me || !allowed) return;
    devCache ??= get('/dev/status')
      .then((r: any) => !!r?.standIns)
      .catch(() => {
        devCache = null;
        return false;
      });
    let live = true;
    devCache.then((v) => live && setEnabled(v));
    return () => {
      live = false;
    };
  }, [me, allowed]);
  return { enabled };
}

// Names for staff ids (support agents), for those allowed to list users.
const DIRECTORY_ROLES = ['SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN'];
export function useAgents() {
  const { has, me } = useSession();
  const allowed = has(...DIRECTORY_ROLES);
  const [agents, setAgents] = useState<{ id: string; displayName: string }[]>([]);
  useEffect(() => {
    if (!me || !allowed) return;
    get<any[]>('/admin/users?role=SUPPORT_AGENT&status=ACTIVE')
      .then((rows) => setAgents(rows.map((r) => ({ id: r.id, displayName: r.displayName }))))
      .catch(() => {});
  }, [me, allowed]);
  const name = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.displayName]));
    return (id: string | null | undefined) => (!id ? '—' : id === me?.id ? `${me.displayName} (you)` : m.get(id) ?? shortId(id));
  }, [agents, me]);
  return { agents, name };
}

export function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="mb-1 break-words sm:mb-0">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ value, max = 'max-h-64' }: { value: unknown; max?: string }) {
  if (value === undefined || value === null) return <span className="text-stone-400">—</span>;
  return <pre className={`${max} overflow-auto rounded-lg bg-stone-100 p-2 text-xs leading-relaxed`}>{JSON.stringify(value, null, 2)}</pre>;
}

export function StandInBanner({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-900">{t('Test stand-ins (not for live use)', 'የሙከራ ምትኮች (ለቀጥታ አገልግሎት አይደሉም)')}</p>
      {children}
    </div>
  );
}

// A button that asks for a written reason, then runs the action.
export function ReasonButton({
  label,
  title,
  tone = 'secondary',
  minLength = 3,
  fieldLabel,
  onSubmit,
  children,
}: {
  label: string;
  title: string;
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
  minLength?: number;
  fieldLabel?: string;
  onSubmit: (reason: string) => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const a = useAction();
  return (
    <>
      <Button tone={tone} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await a.run(async () => {
              await onSubmit(reason.trim());
              return true;
            });
            if (ok) {
              setOpen(false);
              setReason('');
            }
          }}
        >
          {children}
          <Field label={fieldLabel ?? t('Reason (recorded in the audit log)', 'ምክንያት (በኦዲት መዝገብ ይመዘገባል)')}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={minLength} />
          </Field>
          <ErrorText error={a.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" tone="secondary" onClick={() => setOpen(false)}>
              {t('Cancel', 'ይቅር')}
            </Button>
            <Button type="submit" tone={tone === 'danger' ? 'danger' : 'primary'} busy={a.busy} disabled={reason.trim().length < minLength}>
              {t('Confirm', 'አረጋግጥ')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function Notice({ ok, children }: { ok?: string | null; children?: React.ReactNode }) {
  if (!ok && !children) return null;
  return <Alert tone="success">{ok ?? children}</Alert>;
}

export function FilterBar({ children, onSubmit }: { children: React.ReactNode; onSubmit?: () => void }) {
  return (
    <form
      className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      {children}
    </form>
  );
}

export const birrValue = (santim: number | null | undefined) => (santim === null || santim === undefined ? '' : String(santim / 100));

export const ROLE_OPTIONS = ['TALENT', 'CLIENT', 'VETTING_OFFICER', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'MEL_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'PARTNER_VIEWER'];
export const STAFF_ROLE_OPTIONS = ROLE_OPTIONS.slice(2);
export const roleLabel = (r: string) => r.replace(/_/g, ' ').toLowerCase();
