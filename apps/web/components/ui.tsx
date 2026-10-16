'use client';
import Link from 'next/link';
import { forwardRef, useState } from 'react';
import { ApiError } from '@/lib/api';

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost';
const tones: Record<Tone, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300',
  secondary: 'bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-stone-300',
  ghost: 'text-brand-700 hover:bg-brand-50',
};

export function Button({ tone = 'primary', busy, className = '', children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tones[tone]} ${className}`}>
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, tone = 'primary', className = '', children }: { href: string; tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${tones[tone]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputCls = 'block w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-brand-600 focus:outline-none';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} {...props} className={`${inputCls} ${props.className ?? ''}`} />;
});

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ''}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 py-1 text-sm">
      <input type="checkbox" {...props} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
      <span>{label}</span>
    </label>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const badgeTones: Record<string, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
  gray: 'bg-stone-100 text-stone-700',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof badgeTones> = {
  REQUESTED: 'blue', OPEN: 'blue', AGREED: 'amber', FUNDED: 'green', DELIVERED: 'amber', ACCEPTED: 'green', CLOSED: 'gray', CANCELLED: 'gray', DISPUTED: 'red',
  PENDING: 'amber', IN_PROGRESS: 'blue', REVISION_REQUESTED: 'amber', SETTLED: 'green', REFUNDED: 'gray',
  VERIFIED: 'green', PROVISIONAL: 'amber', UNVERIFIED: 'gray', FAILED: 'red', APPROVED: 'green', REJECTED: 'red', NOT_STARTED: 'gray',
  ACTIVE: 'green', SUSPENDED: 'red', DEACTIVATED: 'gray', RESOLVED: 'green',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{label ?? status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', error: 'border-red-200 bg-red-50 text-red-900', success: 'border-green-200 bg-green-50 text-green-900', warning: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
  return <Alert tone="error">{msg}</Alert>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <span className="size-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-label="Loading" />
    </div>
  );
}

export function PageTitle({ children, sub, actions }: { children: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{children}</h1>
        {sub && <p className="mt-1 text-sm text-stone-600">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">{children}</p>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-2 text-stone-500 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Runs an async action with busy and error state for a button.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function Table({ head, rows, empty }: { head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty>{empty ?? 'Nothing here yet.'}</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
