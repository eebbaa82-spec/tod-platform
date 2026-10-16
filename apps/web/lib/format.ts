import { formatEthiopian } from './ethiopian';

export const etb = (santim: number | null | undefined) =>
  santim === null || santim === undefined ? '—' : `ETB ${(santim / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Dates show the Gregorian date with the Ethiopian date beside it.
export function date(value: string | Date | null | undefined, lang: 'en' | 'am' = 'en', withTime = false) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const g = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Addis_Ababa' });
  const t = withTime ? ` ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' })}` : '';
  return `${g}${t} (${formatEthiopian(d, lang)} E.C.)`;
}

export const shortDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Addis_Ababa' }) : '—';

export const toSantim = (birr: string | number) => Math.round(Number(birr) * 100);
export const humanise = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : '');
