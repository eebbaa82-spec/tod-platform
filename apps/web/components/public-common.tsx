'use client';
import { useLang } from '@/lib/i18n';
import { Alert, Badge, Field, Input } from './ui';

// Stable per-browser device id, so sign-ins on a known device skip the SMS code.
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('tod-device');
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('tod-device', id);
    }
    return id;
  } catch {
    return '';
  }
}

export function useTierLabel() {
  const { t } = useLang();
  return (tier: string | null | undefined) =>
    tier === 'ENTRY' ? t('Entry', 'ጀማሪ') : tier === 'INTERMEDIATE' ? t('Intermediate', 'መካከለኛ') : tier === 'EXPERT' ? t('Expert', 'ባለሙያ') : tier ?? '';
}

export function TrustBadge({ level }: { level: string }) {
  const { t } = useLang();
  const map: Record<string, { tone: 'green' | 'blue' | 'gray' | 'amber'; label: string }> = {
    NEW: { tone: 'gray', label: t('New talent', 'አዲስ ባለሙያ') },
    ESTABLISHED: { tone: 'blue', label: t('Established', 'የተረጋገጠ ልምድ') },
    TRUSTED: { tone: 'green', label: t('Trusted', 'ታማኝ') },
    TOP_RATED: { tone: 'amber', label: t('Top rated', 'ከፍተኛ ደረጃ') },
  };
  const m = map[level] ?? { tone: 'gray' as const, label: level };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

// Shown only outside production, where the API returns the SMS code.
export function DevCodeHint({ code }: { code?: string | null }) {
  const { t } = useLang();
  if (!code) return null;
  return (
    <Alert tone="warning">
      {t('Test mode: your code is', 'የሙከራ ሁኔታ፦ ኮድዎ')} <strong className="font-mono tracking-widest">{code}</strong>
    </Alert>
  );
}

export function phoneHint(t: (en: string, am: string) => string) {
  return t('Ethiopian mobile number, for example 0911 234 567', 'የኢትዮጵያ ሞባይል ቁጥር፣ ለምሳሌ 0911 234 567');
}

export function CodeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="text-center font-mono text-xl tracking-[0.5em]"
      />
    </Field>
  );
}

// Support ticket categories, matching CATEGORIES in apps/api/src/support/support.service.ts.
export const TICKET_CATEGORIES = ['ACCOUNT', 'VERIFICATION', 'PAYMENT', 'ASSIGNMENT', 'TECHNICAL', 'ACCOMMODATION', 'FEEDBACK', 'OTHER'] as const;

export function useTicketLabels() {
  const { t } = useLang();
  const category: Record<string, string> = {
    ACCOUNT: t('My account or sign-in', 'መለያዬ ወይም መግቢያ'),
    VERIFICATION: t('Identity or vetting', 'ማንነት ወይም ምርመራ'),
    PAYMENT: t('Payments and escrow', 'ክፍያዎችና የተያዘ ገንዘብ'),
    ASSIGNMENT: t('A piece of work', 'የአንድ ሥራ ጉዳይ'),
    TECHNICAL: t('The app is not working', 'መተግበሪያው አይሠራም'),
    ACCOMMODATION: t('Accessibility or support needs', 'የተደራሽነት ወይም የድጋፍ ፍላጎት'),
    FEEDBACK: t('Ideas and feedback', 'ሀሳቦችና አስተያየቶች'),
    OTHER: t('Something else', 'ሌላ ጉዳይ'),
    SAFEGUARDING: t('Confidential report', 'ሚስጥራዊ ሪፖርት'),
  };
  const status: Record<string, string> = {
    OPEN: t('Open', 'ክፍት'),
    IN_PROGRESS: t('Being handled', 'በሂደት ላይ'),
    RESOLVED: t('Resolved', 'ተፈቷል'),
    CLOSED: t('Closed', 'ተዘግቷል'),
  };
  return { category: (c: string) => category[c] ?? c, status: (s: string) => status[s] ?? s };
}
