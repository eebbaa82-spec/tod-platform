// Amounts are integers in santim (1 ETB = 100 santim).
export const etb = (birr: number) => Math.round(birr * 100);
export const formatEtb = (santim: number) =>
  `ETB ${(santim / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Commission rounds to the nearest santim; the talent receives the remainder.
export function splitCommission(gross: number, rate: number) {
  const commission = Math.round(gross * rate);
  return { gross, commission, net: gross - commission };
}
