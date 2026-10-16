import { BadRequestException } from '@nestjs/common';

// Normalise Ethiopian mobile numbers to E.164 (+2519XXXXXXXX or +2517XXXXXXXX).
export function normalisePhone(input: string): string {
  const digits = (input ?? '').replace(/[^\d+]/g, '');
  let local: string | null = null;
  if (/^\+251[79]\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^251[79]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[79]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[79]\d{8}$/.test(digits)) local = digits;
  if (!local) throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Enter an Ethiopian mobile number, for example 0911 234 567.' });
  return `+251${local}`;
}
