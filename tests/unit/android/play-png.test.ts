// AND-4 regression-first: the standalone --verify path must reject corrupt
// or duplicated tracked Play PNGs, not merely trust an IHDR size header.
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { validatePlayPng, assertUniquePlayShots } from '../../../scripts/play-png.mjs'

const original = readFileSync(resolve(process.cwd(), 'docs/android/shots/today-day-1080x1920.png'))

function makeVerifierFixture() {
  const root = mkdtempSync(join(tmpdir(), 'lemma-play-verify-'))
  for (const dir of ['scripts', 'docs/android/shots', 'public']) {
    mkdirSync(resolve(root, dir), { recursive: true })
  }
  for (const path of ['scripts/play-shots.mjs', 'scripts/play-png.mjs',
    'docs/android/listing.md', 'public/privacy.html']) {
    cpSync(resolve(process.cwd(), path), resolve(root, path))
  }
  cpSync(resolve(process.cwd(), 'docs/android/shots'),
    resolve(root, 'docs/android/shots'), { recursive: true })
  return root
}

describe('AND-4 tracked Play screenshot integrity', () => {
  it('accepts the existing genuine 3× DPR 1080×1920 capture', () => {
    expect(validatePlayPng(original)).toEqual({ width: 1080, height: 1920, scale: 3 })
  })

  it('rejects a header CRC mutation even when width and height are unchanged', () => {
    const corrupted = Buffer.from(original)
    corrupted[29] ^= 1 // IHDR CRC, not the dimension bytes
    expect(() => validatePlayPng(corrupted)).toThrow()
  })

  it('rejects corrupted IDAT bytes and a truncated chunk chain', () => {
    const corrupted = Buffer.from(original)
    const idat = corrupted.indexOf(Buffer.from('IDAT'))
    expect(idat).toBeGreaterThan(0)
    corrupted[idat + 4] ^= 1
    expect(() => validatePlayPng(corrupted)).toThrow()
    expect(() => validatePlayPng(original.subarray(0, -4))).toThrow()
  })

  it('rejects the same capture reused for a different screen or theme', () => {
    expect(() => assertUniquePlayShots([
      { name: 'today-day', bytes: original },
      { name: 'atlas-night', bytes: Buffer.from(original) },
    ])).toThrow(/duplicate|identical|stale/i)
  })

  it('rejects a valid capture with the wrong expected device-pixel dimensions', () => {
    expect(() => validatePlayPng(original, 390, 640)).toThrow()
  })

  it('fails closed until all eight genuine listing PNGs are committed to git', () => {
    const tracked = new Set(execFileSync('git', ['ls-files', '--', 'docs/android/shots'], {
      encoding: 'utf8',
    }).trim().split('\n'))
    const captures = []
    for (const screen of ['today', 'project', 'review', 'atlas']) {
      for (const world of ['day', 'night']) {
        const name = `docs/android/shots/${screen}-${world}-1080x1920.png`
        expect(tracked.has(name), `missing tracked AND-4 screenshot: ${name}`).toBe(true)
        const bytes = readFileSync(resolve(process.cwd(), name))
        expect(validatePlayPng(bytes)).toEqual({ width: 1080, height: 1920, scale: 3 })
        captures.push({ name, bytes })
      }
    }
    expect(() => assertUniquePlayShots(captures)).not.toThrow()
  })
  it('rejects over-limit Play listing text through the standalone verifier', () => {
    const fixture = makeVerifierFixture()
    try {
      const listingPath = resolve(fixture, 'docs/android/listing.md')
      const listing = readFileSync(listingPath, 'utf8')
      writeFileSync(listingPath, listing.replace(/^Title:.*$/m, 'Title: ' + 'L'.repeat(31)))
      expect(() => execFileSync('node', [resolve(fixture, 'scripts/play-shots.mjs'), '--verify'], {
        cwd: fixture, stdio: 'pipe',
      })).toThrow()
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })

  it('rejects an external privacy-page resource through the standalone verifier', () => {
    const fixture = makeVerifierFixture()
    try {
      const privacyPath = resolve(fixture, 'public/privacy.html')
      const privacy = readFileSync(privacyPath, 'utf8')
      writeFileSync(privacyPath, privacy.replace('</head>', '<img src="https://example.org/tracker.png"></head>'))
      expect(() => execFileSync('node', [resolve(fixture, 'scripts/play-shots.mjs'), '--verify'], {
        cwd: fixture, stdio: 'pipe',
      })).toThrow()
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })

})
