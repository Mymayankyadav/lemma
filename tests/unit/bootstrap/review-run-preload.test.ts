import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const preloadMarker = 'data-review-run-preload'
const script = html.match(/<script\b[^>]*data-review-run-preload[^>]*>([\s\S]*?)<\/script>/)?.[1]

function preloadTargets(hash: string): { review: boolean; app: boolean } {
  expect(script).toBeDefined()
  expect(script).toMatch(/void import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/)
  expect(script).toMatch(/void import\(['"]\/src\/app\/App\.tsx['"]\)/)

  // Exercise the actual inline guard, replacing BOTH dynamic imports with
  // spies. Otherwise Node's VM attempts the non-Review App import and throws
  // ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING, hiding a valid branch decision.
  const instrumented = script!
    .replace(/void import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/, 'globalThis.preloadTriggered = true')
    .replace(/void import\(['"]\/src\/app\/App\.tsx['"]\)/, 'globalThis.appPreloadTriggered = true')
  const sandbox = { location: { hash }, preloadTriggered: false, appPreloadTriggered: false }
  runInNewContext(instrumented, sandbox, { timeout: 1000 })
  return { review: sandbox.preloadTriggered, app: sandbox.appPreloadTriggered }
}

function preloadsReviewRun(hash: string): boolean {
  return preloadTargets(hash).review
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

  it('prefetches the App graph for non-Review entries, never alongside Review-run', () => {
    for (const hash of [
      '#/', '#/atlas', '#/cards', '#/review', '#/review?start=5',
      '#/review/running', '#/review/run-extra', '#/review/run/child',
      '#/review/running?session=abc',
    ]) expect(preloadTargets(hash), hash).toEqual({ review: false, app: true })
    for (const hash of [
      '#/review/run', '#/review/run?session=abc',
      '#/review/run?concept=compactness', '#/review/run?new=1',
      '#/review/run?session=abc&concept=compactness', '#/review/run?',
    ]) expect(preloadTargets(hash), hash).toEqual({ review: true, app: false })
  })
})
