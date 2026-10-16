// Working-day arithmetic for review windows, dispute limits and ticket acknowledgement.
// Saturday and Sunday are non-working; public holidays come from the HOLIDAYS parameter.
export function isWorkingDay(d: Date, holidays: string[]): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !holidays.includes(d.toISOString().slice(0, 10));
}

export function addWorkingDays(start: Date, days: number, holidays: string[] = []): Date {
  const d = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d, holidays)) added++;
  }
  return d;
}
