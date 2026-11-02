import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Regression for QA-4b: a successful strict-route-budgets job is not a gate
// if a UI-only or ST-0-test-only PR never triggers its workflow.
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/review-shots.yml'), 'utf8')
const pullRequestBlock = workflow.split(/^  workflow_dispatch:/m)[0]
const pathPatterns = [...pullRequestBlock.matchAll(/^      - '([^']+)'\s*$/gm)].map((match) => match[1])

function triggersFor(path: string): boolean {
  return pathPatterns.some((pattern) =>
    pattern.endsWith('/**') ? path.startsWith(pattern.slice(0, -3) + '/') : pattern === path,
  )
}

describe('QA-4b strict route-budget workflow trigger coverage', () => {
  it('runs for source-only UI and stress-test-only pull requests', () => {
    expect(pullRequestBlock).toContain('pull_request:')
    expect(pathPatterns.length).toBeGreaterThan(0)
    expect(triggersFor('src/features/cards/Page.tsx')).toBe(true)
    expect(triggersFor('src/styles/graph.css')).toBe(true)
    expect(triggersFor('src/ui/Button.tsx')).toBe(true)
    expect(triggersFor('tests/e2e/stress.spec.ts')).toBe(true)
  })

  it('runs for stress thresholds, fixtures, configuration and dependency changes', () => {
    for (const path of [
      'scripts/stress-gate.ts',
      'scripts/qa3-report.ts',
      'tests/fixtures/stress-fixture.json',
      'public/manifest.webmanifest',
      'playwright.config.ts',
      'vite.config.ts',
      'package.json',
      'package-lock.json',
      'docs/spec/stress.md',
      'docs/spec/v4-look.md',
      '.github/workflows/review-shots.yml',
    ]) {
      expect(triggersFor(path), path).toBe(true)
    }
  })
})
