import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const paths = [
  'android/twa-manifest.json',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/values/strings.xml',
  'android/app/build.gradle',
]
const root = resolve(process.cwd())
const script = resolve(root, 'android/scripts/check-shell.mjs')
function verify(mutate?: (files: Record<string, string>) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'lemma-n7-'))
  try {
    const files = Object.fromEntries(paths.map(path => [path, readFileSync(resolve(root, path), 'utf8')]))
    mutate?.(files)
    for (const [path, text] of Object.entries(files)) {
      const target = join(dir, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
    return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
describe('N7 Android TWA shell', () => {
  it('accepts the archived TWA metadata', () => {
    const result = verify()
    expect(result.status).toBe(0)
  })
  it('rejects a mutated package name', () => {
    const result = verify(files => { files['android/twa-manifest.json'] = files['android/twa-manifest.json'].replace('io.github.mymayankyadav.lemma', 'com.example.wrong') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('wrong package')
  })
  it('rejects missing asset-links manifest entry', () => {
    const result = verify(files => { files['android/app/src/main/AndroidManifest.xml'] = files['android/app/src/main/AndroidManifest.xml'].replace('android:name="asset_statements"', 'android:name="missing_asset_statements"') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing asset-links entry')
  })
  it('rejects a wrong /lemma/ launch URL', () => {
    const result = verify(files => { files['android/app/src/main/AndroidManifest.xml'] = files['android/app/src/main/AndroidManifest.xml'].replace('android.support.customtabs.trusted.DEFAULT_URL" android:value="https://mymayankyadav.github.io/lemma/"', 'android.support.customtabs.trusted.DEFAULT_URL" android:value="https://mymayankyadav.github.io/wrong/"') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing launch URL')
  })
})
