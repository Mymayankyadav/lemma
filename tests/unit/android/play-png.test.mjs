// AND-4 regression-first: the standalone --verify path must reject corrupt
// or duplicated tracked Play PNGs, not merely trust an IHDR size header.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { validatePlayPng, assertUniquePlayShots } from '../../../scripts/play-png.mjs'

const original = readFileSync(new URL('../../../docs/android/shots/today-day-1080x1920.png', import.meta.url))

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
})
