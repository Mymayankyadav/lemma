/**
 * V36 (v7 UX audit r3): the time log's week, named above its day strip ("9–15 November"), so the strip can use the
 * whole width and every day is a 44 px target. `from` is the week's first civil day (YYYY-MM-DD); the year shows only
 * when the week is not in `today`'s year or runs across two years.
 */
const month = (date: Date, form: 'long' | 'short') => new Intl.DateTimeFormat('en-GB', {month: form, timeZone: 'UTC'}).format(date);

export function weekRangeLabel(from: string, today: string): string {
  const start = new Date(`${from}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const year = Number(today.slice(0, 4));
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${start.getUTCDate()} ${month(start, 'short')} ${start.getUTCFullYear()} – ${end.getUTCDate()} ${month(end, 'short')} ${end.getUTCFullYear()}`;
  }
  const suffix = start.getUTCFullYear() === year ? '' : ` ${start.getUTCFullYear()}`;
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${start.getUTCDate()} ${month(start, 'short')} – ${end.getUTCDate()} ${month(end, 'short')}${suffix}`;
  return `${start.getUTCDate()}–${end.getUTCDate()} ${month(start, 'long')}${suffix}`;
}
