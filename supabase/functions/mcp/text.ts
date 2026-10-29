export function cut(value: unknown, max: number): string {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const v = s.slice(0, Math.max(0, max - 1));
  return (v.slice(0, Math.max(0, v.lastIndexOf(' '))) || v) + '…';
}
export function capped(s: string, n: number): string { if (s.length<=n) return s;
  const prefix=s.slice(0,n-1);
  return prefix.slice(0,Math.max(prefix.lastIndexOf(' '),prefix.lastIndexOf('\n'),n-80))+'…'; }
export function date(s?: string): string {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-GB', {day:'numeric',month:'short',timeZone:'UTC'});
}
export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
}
export function number(s: string, letter: string): number {
  const m = new RegExp('^' + letter + '(\\d+)$','i').exec(s);
  if (!m) throw new Error('Use ' + letter + ' followed by a number');
  return Number(m[1]);
}
export function pageRange(a: string, b?: string): string[] {
  if (!b || a === b) return [a];
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) throw new Error('For roman pages, read one page at a time');
  const first = Number(a), last = Number(b);
  if (last < first || last - first >= 5) throw new Error('Read at most 5 consecutive pages');
  return Array.from({length:last-first+1},(_,i)=>String(first+i));
}
export function normalizedFront(s: string): string {
  return s.toLowerCase().replace(/[$\\]/g,'').replace(/\s+/g,' ').trim();
}