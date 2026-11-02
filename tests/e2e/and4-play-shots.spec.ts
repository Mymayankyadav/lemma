import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pngHeader } from '../../scripts/qa3-screens'

const execFileAsync = promisify(execFile)
const screens = ['today', 'project', 'review', 'atlas'] as const
const themes = ['day', 'night'] as const

// Store screenshots are release artifacts, not a flaky UI retry gate.
// A genuine browser render must precede each PNG; never fabricate a placeholder.
test.describe.configure({ retries: 0 })

test('AND-4 captures eight real 1080x1920 Play images with a loaded review card', async () => {
  test.setTimeout(240_000)
  const outputDir = resolve('test-results/screens/android')
  await mkdir(outputDir, { recursive: true })
  let captureError: unknown
  let stdout = ''
  try {
    const result = await execFileAsync(process.execPath, ['scripts/play-shots.mjs', '--capture'], {
      cwd: process.cwd(),
      env: { ...process.env, LEMMA_SCREENSHOT_BASE_URL: 'http://localhost:4173/lemma/' },
      timeout: 210_000,
      maxBuffer: 1024 * 1024,
    })
    stdout = result.stdout
  } catch (error) {
    captureError = error
  } finally {
    // Preserve partial genuine captures in the existing shard artifact even
    // when a later route fails, so the failing screen can be diagnosed.
    for (const screen of screens) for (const theme of themes) {
      const name = `${screen}-${theme}-1080x1920.png`
      try {
        await copyFile(resolve('docs/android/shots', name), resolve(outputDir, name))
      } catch {
        // The capture script reports the missing route; never create fake PNGs.
      }
    }
  }
  if (captureError) throw captureError

  expect(stdout).toContain('READY: review/day real card')
  expect(stdout).toContain('READY: review/night real card')
  expect(stdout).toContain('AND-4 verified: Play text limits, privacy contract, eight real-size PNGs')

  const hashes = new Set<string>()
  for (const screen of screens) for (const theme of themes) {
    const bytes = await readFile(resolve(outputDir, `${screen}-${theme}-1080x1920.png`))
    // Reuse the existing QA-3 PNG decoder: validates chunk CRCs, inflated
    // scanlines and the real 3x device-pixel ratio, not just an IHDR header.
    expect(pngHeader(bytes, 360, 640)).toEqual({ width: 1080, height: 1920, scale: 3 })
    const hash = createHash('sha256').update(bytes).digest('hex')
    expect(hashes.has(hash), `stale/duplicated capture: ${screen}/${theme}`).toBe(false)
    hashes.add(hash)
  }
})
