import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const preloadMarker = 'data-review-run-preload'

describe('FIX-651a conditional Review-run cold bootstrap', () => {
  it('starts the route preload before the main React entry module', () => {
    const preloadAt = html.indexOf(preloadMarker)
    const mainAt = html.indexOf('src="/src/main.tsx"')
    expect(preloadAt).toBeGreaterThan(0)
    expect(mainAt).toBeGreaterThan(preloadAt)
    expect(html.slice(preloadAt, mainAt)).toMatch(/type="module"/)
  })

  it('only preloads the Review-run route, not Today, Atlas or Cards', () => {
    const script = html.match(/<script\b[^>]*data-review-run-preload[^>]*>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeDefined()
    expect(script).toMatch(/if\s*\(\s*location\.hash\s*===\s*['"]#\/review\/run['"]\s*\)\s*\{/)
    expect(script).toMatch(/import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/)
  })
})
