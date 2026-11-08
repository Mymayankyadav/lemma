import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Incident #1291: two migrations shared one version, so `supabase db push` saw the second
// as pending after the first was recorded and the deploy failed. Versions must be unique.
describe('supabase migration versions', () => {
  const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))

  it('every file is named <14-digit version>_<name>.sql', () => {
    for (const f of files) expect(f, f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
  })

  it('no two migrations share a version', () => {
    const seen = new Map<string, string>()
    for (const f of files) {
      const v = f.slice(0, 14)
      expect(seen.get(v), `${f} duplicates the version of ${seen.get(v)}`).toBeUndefined()
      seen.set(v, f)
    }
  })
})
