'use client';
import { useRef, useState } from 'react';
import { ApiError, upload } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { Badge, ErrorText, StatusBadge } from './ui';

type T = (en: string, am: string) => string;

// Plain-language labels for assignment states.
export function assignmentStatusLabel(status: string, t: T) {
  const map: Record<string, [string, string]> = {
    REQUESTED: ['Being set up', 'በመዘጋጀት ላይ'],
    OPEN: ['Taking offers', 'ቅናሾችን እየተቀበለ'],
    AGREED: ['Waiting for payment', 'ክፍያ በመጠበቅ ላይ'],
    FUNDED: ['Work in progress', 'ሥራ በሂደት ላይ'],
    DELIVERED: ['Delivered', 'ተረክቧል'],
    ACCEPTED: ['Accepted', 'ተቀባይነት አግኝቷል'],
    DISPUTED: ['In dispute', 'በክርክር ላይ'],
    CLOSED: ['Finished', 'ተጠናቋል'],
    CANCELLED: ['Cancelled', 'ተሰርዟል'],
  };
  const v = map[status];
  return v ? t(v[0], v[1]) : status;
}

export function milestoneStatusLabel(status: string, t: T) {
  const map: Record<string, [string, string]> = {
    PENDING: ['Not started yet', 'ገና አልተጀመረም'],
    IN_PROGRESS: ['In progress', 'በሂደት ላይ'],
    DELIVERED: ['Delivered, waiting for review', 'ተረክቧል፣ ግምገማ በመጠበቅ ላይ'],
    REVISION_REQUESTED: ['Changes asked', 'ማስተካከያ ተጠይቋል'],
    ACCEPTED: ['Accepted', 'ተቀባይነት አግኝቷል'],
    DISPUTED: ['In dispute', 'በክርክር ላይ'],
    SETTLED: ['Paid', 'ተከፍሏል'],
    REFUNDED: ['Refunded', 'ተመልሷል'],
    CANCELLED: ['Cancelled', 'ተሰርዟል'],
  };
  const v = map[status];
  return v ? t(v[0], v[1]) : status;
}

export function AssignmentStatus({ status }: { status: string }) {
  const { t } = useLang();
  return <StatusBadge status={status} label={assignmentStatusLabel(status, t)} />;
}

export function MilestoneStatus({ status }: { status: string }) {
  const { t } = useLang();
  return <StatusBadge status={status} label={milestoneStatusLabel(status, t)} />;
}

export function tierLabel(tier: string | null | undefined, t: T) {
  if (tier === 'ENTRY') return t('Entry', 'ጀማሪ');
  if (tier === 'INTERMEDIATE') return t('Intermediate', 'መካከለኛ');
  if (tier === 'EXPERT') return t('Expert', 'ባለሙያ');
  return t('No tier yet', 'ደረጃ ገና የለም');
}

export function TierBadge({ tier }: { tier: string | null | undefined }) {
  const { t } = useLang();
  return <Badge tone={tier === 'EXPERT' ? 'green' : tier ? 'blue' : 'gray'}>{tierLabel(tier, t)}</Badge>;
}

export function workModeLabel(mode: string | null | undefined, t: T) {
  if (mode === 'REMOTE') return t('From home (remote)', 'ከቤት (በርቀት)');
  if (mode === 'ONSITE') return t('At the business (on site)', 'በሥራ ቦታው ላይ');
  if (mode === 'BOTH') return t('Either', 'ሁለቱም');
  return '—';
}

export function identityLabel(status: string | null | undefined, t: T) {
  const map: Record<string, [string, string]> = {
    UNVERIFIED: ['Not verified', 'አልተረጋገጠም'],
    PENDING: ['Check in progress', 'ማረጋገጫ በሂደት ላይ'],
    PROVISIONAL: ['Provisionally verified', 'በጊዜያዊነት ተረጋግጧል'],
    VERIFIED: ['Verified', 'ተረጋግጧል'],
    FAILED: ['Check failed', 'ማረጋገጫ አልተሳካም'],
  };
  const v = map[status ?? ''];
  return v ? t(v[0], v[1]) : status ?? '';
}

export function vettingLabel(status: string | null | undefined, t: T) {
  const map: Record<string, [string, string]> = {
    NOT_STARTED: ['Not started', 'አልተጀመረም'],
    IN_PROGRESS: ['In progress', 'በሂደት ላይ'],
    APPROVED: ['Approved', 'ጸድቋል'],
    REJECTED: ['Not approved', 'አልጸደቀም'],
  };
  const v = map[status ?? ''];
  return v ? t(v[0], v[1]) : status ?? '';
}

// Explains an API error code in plain words where we know it.
export function friendlyError(e: unknown, t: T): string | null {
  if (!(e instanceof ApiError)) return null;
  switch (e.code) {
    case 'IDENTITY_REQUIRED':
      return t('Please verify your identity first. Go to your account page and start the identity check.', 'እባክዎ መጀመሪያ ማንነትዎን ያረጋግጡ። ወደ መለያ ገጽዎ ሄደው የማንነት ማረጋገጫውን ይጀምሩ።');
    case 'VALUE_LIMIT':
      return t(`${e.message} Choose a smaller package, or move your business to a higher level.`, `${e.message} አነስተኛ ጥቅል ይምረጡ፣ ወይም የንግድዎን ደረጃ ያሳድጉ።`);
    case 'NO_CLIENT_PROFILE':
      return t('Fill in your business profile first.', 'መጀመሪያ የንግድ መገለጫዎን ይሙሉ።');
    default:
      return null;
  }
}

export function FriendlyError({ error }: { error: unknown }) {
  const { t } = useLang();
  if (!error) return null;
  const msg = friendlyError(error, t);
  return msg ? <ErrorText error={new Error(msg)} /> : <ErrorText error={error} />;
}

export function FileLink({ id, name }: { id: string; name?: string }) {
  const { t } = useLang();
  return (
    <a href={`/api/files/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-2">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
      {name ?? t('Download file', 'ፋይል ያውርዱ')}
    </a>
  );
}

// Upload one or more files with a purpose; lists what was added.
export function FileUploader({ purpose, files, onChange, label }: { purpose: Parameters<typeof upload>[1]; files: { id: string; name: string }[]; onChange: (f: { id: string; name: string }[]) => void; label?: string }) {
  const { t } = useLang();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added: { id: string; name: string }[] = [];
      for (const f of Array.from(list)) {
        const r = await upload(f, purpose);
        added.push({ id: r.id, name: r.name });
      }
      onChange([...files, ...added]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-stone-400 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
        {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {label ?? t('Add a file', 'ፋይል ያክሉ')}
      </button>
      <p className="text-xs text-stone-500">{t('PDF, photos, Office documents, ZIP, CSV or text.', 'PDF፣ ፎቶዎች፣ የOffice ሰነዶች፣ ZIP፣ CSV ወይም ጽሑፍ።')}</p>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md bg-stone-50 px-3 py-2 text-sm">
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="shrink-0 rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                {t('Remove', 'አስወግድ')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
    </div>
  );
}

// Five large tappable stars.
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-stone-800">{label}</p>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} onClick={() => onChange(n)} className={`grid size-11 place-items-center rounded-lg text-2xl ${n <= value ? 'text-amber-500' : 'text-stone-300'} hover:bg-stone-100`}>
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-label={`${value} / 5`}>
      {'★'.repeat(full)}
      <span className="text-stone-300">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

// A simple list of label/value rows.
export function Facts({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="font-medium text-stone-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Addis Ababa sub-cities (values stored in English).
export const SUB_CITIES: { en: string; am: string }[] = [
  { en: 'Addis Ketema', am: 'አዲስ ከተማ' },
  { en: 'Akaky Kaliti', am: 'አቃቂ ቃሊቲ' },
  { en: 'Arada', am: 'አራዳ' },
  { en: 'Bole', am: 'ቦሌ' },
  { en: 'Gullele', am: 'ጉለሌ' },
  { en: 'Kirkos', am: 'ቂርቆስ' },
  { en: 'Kolfe Keranio', am: 'ኮልፌ ቀራንዮ' },
  { en: 'Lemi Kura', am: 'ለሚ ኩራ' },
  { en: 'Lideta', am: 'ልደታ' },
  { en: 'Nifas Silk-Lafto', am: 'ንፋስ ስልክ ላፍቶ' },
  { en: 'Yeka', am: 'የካ' },
];

export function subCityOptions(t: T, placeholder: string) {
  return [{ value: '', label: placeholder }, ...SUB_CITIES.map((s) => ({ value: s.en, label: t(s.en, s.am) }))];
}
