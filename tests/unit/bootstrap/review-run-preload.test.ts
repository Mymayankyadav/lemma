import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const preloadMarker = 'data-review-run-preload'
const script = html.match(/<script\b[^>]*data-review-run-preload[^>]*>([\s\S]*?)<\/script>/)?.[1]

function preloadsReviewRun(hash: string): boolean {
  expect(script).toBeDefined()
  expect(script).toMatch(/void import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/)

  // Exercise the actual inline route guard, replacing only its dynamic import
  // with a spy; this catches query-bearing hashes that source regexes miss.
  const instrumented = script!.replace(
    /void import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/,
    'globalThis.preloadTriggered = true',
  )
  const sandbox = { location: { hash }, preloadTriggered: false }
  runInNewContext(instrumented, sandbox, { timeout: 1000 })
  return sandbox.preloadTriggered
}

describe('FIX-651a conditional Review-run cold bootstrap', () => {
  it('starts the route preload before the main React entry module', () => {
    const preloadAt = html.indexOf(preloadMarker)
    const mainAt = html.indexOf('src="/src/main.tsx"')
    expect(preloadAt).toBeGreaterThan(0)
    expect(mainAt).toBeGreaterThan(preloadAt)
    const scriptStart = html.lastIndexOf('<script', preloadAt)
    expect(scriptStart).toBeGreaterThan(-1)
    expect(html.slice(scriptStart, preloadAt)).toContain('type="module"')
  })

  it('preloads both plain and filtered Review-run cold deep links', () => {
    for (const hash of [
      '#/review/run',
      '#/review/run?session=abc',
      '#/review/run?concept=compactness',
      '#/review/run?new=1',
      '#/review/run?session=abc&concept=compactness',
      '#/review/run?',
    ]) {
      expect(preloadsReviewRun(hash), hash).toBe(true)
    }
  })

  it('never preloads Today, Atlas, Cards or a Review-run prefix collision', () => {
    for (const hash of [
      '#/',
      '#/atlas',
      '#/cards',
      '#/review',
      '#/review?start=5',
      '#/review/running',
      '#/review/run-extra',
      '#/review/run/child',
      '#/review/running?session=abc',
    ]) {
      expect(preloadsReviewRun(hash), hash).toBe(false)
    }
  })
})
