import { describe, expect, it } from 'vitest'
import { reuseSubject, visibleProjects, sourceLine } from '../../../supabase/functions/mcp/v3.ts'

const subjects = [
  { id: 'analysis', name: 'Analysis' },
  { id: 'algebra', name: 'Algebra' },
  { id: 'topology', name: 'Topology' },
  { id: 'selftest', name: 'zz-selftest-123' },
]

describe('MCP-4 owner-facing project and subject matching', () => {
  it('reuses subjects across case, field qualification and close spelling', () => {
    expect(reuseSubject(subjects, 'analysis')?.id).toBe('analysis')
    expect(reuseSubject(subjects, 'Real Analysis')?.id).toBe('analysis')
    expect(reuseSubject(subjects, 'Algebara')?.id).toBe('algebra')
    expect(reuseSubject(subjects, 'Topology')?.id).toBe('topology')
    expect(reuseSubject(subjects, 'zz-selftest-123')).toBeNull()
    expect(reuseSubject(subjects, 'Probability')).toBeNull()
  })

  it('never exposes archived or system projects to connector menus', () => {
    const rows = [
      { slug: 'analysis', status: 'active', system: false },
      { slug: 'archived', status: 'archived', system: false },
      { slug: 'test', status: 'active', system: true },
    ]
    expect(visibleProjects(rows).map(x => x.slug)).toEqual(['analysis'])
  })

  it('lists source kind, upload date and unplanned status', () => {
    expect(sourceLine({
      short: 'notes-w7', title: 'Week 7 notes', kind: 'notes',
      page_count: 12, added_at: '2026-10-30T12:00:00Z', plan_checked_at: null,
    })).toContain('notes-w7 notes "Week 7 notes" 12 pages added 2026-10-30 NEW')
    expect(sourceLine({ short: 'rudin', title: 'Principles', kind: 'book', plan_checked_at: '2026-10-30' }))
      .not.toContain('NEW')
  })
})
