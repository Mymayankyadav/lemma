// Pure v3 connector helpers. Keep matching deterministic and owner-scoped:
// callers must supply rows already filtered by Context.userId.
export type SubjectCandidate = { id: string; name: string }

const normalize = (s: string) => s.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]))
    }
    previous.splice(0, previous.length, ...next)
  }
  return previous[b.length]
}

// Exact, field-qualified and close-spelling matches are considered in that
// order. Ambiguous matches deliberately return null rather than misclassify.
export function reuseSubject<T extends SubjectCandidate>(subjects: T[], requested: string): T | null {
  const query = normalize(requested)
  if (!query) return null
  const candidates = subjects.filter(x => !/^zz selftest\b/.test(normalize(x.name)))
  const exact = candidates.filter(x => normalize(x.name) === query)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const qualified = candidates.filter(x => {
    const name = normalize(x.name)
    return query.endsWith(' ' + name) || name.endsWith(' ' + query)
  })
  if (qualified.length === 1) return qualified[0]
  if (qualified.length > 1) return null
  const ranked = candidates.map(x => ({ x, d: distance(normalize(x.name), query) }))
    .sort((a, b) => a.d - b.d)
  const best = ranked[0]
  if (!best || best.d > (Math.min(query.length, normalize(best.x.name).length) > 8 ? 2 : 1)
    || ranked[1]?.d === best.d) return null
  return best.x
}

export function visibleProjects<T extends { system?: boolean; status?: string }>(rows: T[]): T[] {
  return rows.filter(x => !x.system && x.status !== 'archived')
}

export type V3Source = {
  short: string; title: string; kind?: string; page_count?: number | null;
  added_at?: string | null; plan_checked_at?: string | null
}

export function sourceLine(s: V3Source): string {
  const pages = s.page_count == null ? 'attached' : String(s.page_count) + ' pages'
  return s.short + ' ' + (s.kind || 'other') + ' "' + s.title.slice(0, 50) +
    '" ' + pages + (s.added_at ? ' added ' + s.added_at.slice(0, 10) : '') +
    (s.plan_checked_at ? '' : ' NEW')
}
