import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

// N7 checked the Trusted Web Activity; N123 replaced it with the Capacitor app. The same invariants (package id,
// /lemma/ launch URL, asset-links App Links) are checked on the new shell, plus the permissions the plan allows.
const paths = [
  'capacitor.config.json',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/build.gradle',
  'android/build.gradle',
]
const root = resolve(process.cwd())
const script = resolve(root, 'android/scripts/check-shell.mjs')
function verify(mutate?: (files: Record<string, string>) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'lemma-n123-'))
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
const manifest = 'android/app/src/main/AndroidManifest.xml'
describe('N7/N123 Android shell', () => {
  it('accepts the Capacitor shell', () => {
    const result = verify()
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
  it('rejects a mutated package name', () => {
    const result = verify(files => { files['capacitor.config.json'] = files['capacitor.config.json'].replace('io.github.mymayankyadav.lemma', 'com.example.wrong') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('wrong package')
  })
  it('rejects a mutated Gradle application id', () => {
    const result = verify(files => { files['android/app/build.gradle'] = files['android/app/build.gradle'].replace('applicationId "io.github.mymayankyadav.lemma"', 'applicationId "com.example.wrong"') })
    expect(result.stderr).toContain('wrong package')
  })
  it('rejects missing asset-links (App Links) intent filter', () => {
    const result = verify(files => { files[manifest] = files[manifest].replace('android:autoVerify="true"', '') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing asset-links')
  })
  it('rejects a wrong /lemma/ launch URL', () => {
    const result = verify(files => { files['capacitor.config.json'] = files['capacitor.config.json'].replace('"appStartPath": "/lemma/"', '"appStartPath": "/wrong/"') })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing launch path')
  })
  it('rejects permissions the plan does not allow', () => {
    for (const permission of ['CAMERA', 'ACCESS_FINE_LOCATION', 'RECORD_AUDIO', 'USE_EXACT_ALARM']) {
      const result = verify(files => { files[manifest] = files[manifest].replace('<uses-permission android:name="android.permission.INTERNET" />', `<uses-permission android:name="android.permission.INTERNET" /><uses-permission android:name="android.permission.${permission}" />`) })
      expect(result.stderr).toContain('forbidden permission ' + permission)
    }
  })
  // Owner, 14 Nov 2026 (N163): Firebase Cloud Messaging is approved, and nothing else from Firebase or Google services.
  it('rejects the google-services plugin, which the Owner did not approve', () => {
    const result = verify(files => { files['android/build.gradle'] = files['android/build.gradle'].replace("classpath 'com.android.tools.build:gradle", "classpath 'com.google.gms:google-services:4.4.4'\n        classpath 'com.android.tools.build:gradle") })
    expect(result.stderr).toContain('Firebase is approved only for Cloud Messaging, without the google-services plugin')
  })
  it('rejects every Firebase library except Cloud Messaging', () => {
    for (const artifact of ['firebase-analytics:22.0.0', 'firebase-crashlytics:19.0.0', 'firebase-bom:33.0.0']) {
      const result = verify(files => { files['android/app/build.gradle'] = files['android/app/build.gradle'].replace('dependencies {', `dependencies {\n    implementation 'com.google.firebase:${artifact}'`) })
      expect(result.stderr).toContain('Firebase is approved only for Cloud Messaging (com.google.firebase:firebase-messaging)')
    }
  })
  it('accepts Firebase Cloud Messaging', () => {
    const result = verify(files => { files['android/app/build.gradle'] = files['android/app/build.gradle'].replace('dependencies {', "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:25.0.0'") })
    expect(result.stderr).not.toContain('Firebase')
  })
  it('keeps the sign-in callback', () => {
    const result = verify(files => { files[manifest] = files[manifest].replace('android:host="auth"', 'android:host="other"') })
    expect(result.stderr).toContain('missing sign-in callback')
  })
})
