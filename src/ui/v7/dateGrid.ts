/** Civil dates are represented at local noon so keyboard steps span month, year and DST boundaries. */
export function civilDate(value: string | undefined) {
  const parsed = new Date((value ?? '') + 'T12:00:00');
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}
export function dayKey(date: Date) {
  return [String(date.getFullYear()).padStart(4,'0'),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function changeMonth(date: Date, delta: number) {
  const next = new Date(date.getFullYear(), date.getMonth()+delta, 1, 12);
  const count = new Date(next.getFullYear(),next.getMonth()+1,0).getDate();
  next.setDate(Math.min(date.getDate(),count));
  return next;
}
export function moveDay(date: Date, key: string, shift = false) {
  if (key === 'PageUp' || key === 'PageDown') return changeMonth(date,(key === 'PageUp' ? -1 : 1)*(shift ? 12 : 1));
  const offsets: Record<string,number> = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-date.getDay(),End:6-date.getDay()};
  if (!(key in offsets)) return null;
  const next = new Date(date);
  next.setDate(next.getDate()+offsets[key]);
  return next;
}
