import { describe, expect, it } from 'vitest'
import { reuseSubject, visibleProjects, sourceLine, scheduleHint, isPdfPageIndex } from '../../../supabase/functions/mcp/v3.ts'
import {planningFields} from '../../../supabase/functions/mcp/planning.ts'

const subjects = [
  { id: 'analysis', name: 'Analysis' },
  { id: 'algebra', name: 'Algebra' },
  { id: 'topology', name: 'Topology' },
  { id: 'selftest', name: 'zz-selftest-123' },
]

describe('MCP-4 owner-facing project and subject matching', () => {
  it('rejects impossible dates in dynamically edited checkpoint schedules',()=>{
    expect(()=>planningFields({due_on:'2026-02-30'})).toThrow(/due_on/);
    expect(()=>planningFields({due_on:'not-a-date'})).toThrow(/due_on/);
    expect(()=>planningFields({due_on:'2026-11-12'})).not.toThrow();
    expect(()=>planningFields({due_on:null})).not.toThrow();
  })

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

  it('reports early, on-time and late checkpoint projections without shaming', () => {
    const now = Date.parse('2026-10-30T12:00:00Z')
    const cp = (due_on: string) => [{ status: 'in_progress', due_on, steps: ['Prove'] }]
    expect(scheduleHint({}, cp('2026-11-20'), now)).toBe(' | 7 days behind plan')
    expect(scheduleHint({}, cp('2026-11-27'), now)).toBe(' | on schedule')
    expect(scheduleHint({}, cp('2026-12-10'), now)).toBe(' | 13 days ahead of plan')
    expect(scheduleHint({}, [{ status: 'in_progress' }], now)).toBe('')
    expect(scheduleHint({ target_date: '2026-12-10' }, [
      { status: 'in_progress', steps: ['Read'] }, { status: 'not_started', steps: ['Prove'] },
    ], now)).toContain('days behind plan')
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


describe('MCP-4 PDF page index regression',()=>{
  it('accepts decimal indexes in source PDFs and rejects labels or zero',()=>{
    expect(isPdfPageIndex('1')).toBe(true)
    expect(isPdfPageIndex('12')).toBe(true)
    expect(isPdfPageIndex('0')).toBe(false)
    expect(isPdfPageIndex('iv')).toBe(false)
    expect(isPdfPageIndex('1a')).toBe(false)
    expect(isPdfPageIndex('-1')).toBe(false)
  })
})
