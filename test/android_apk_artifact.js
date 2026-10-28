'use strict';
// ANDROID-02 N4a: fail closed before distributing a CI APK with stale assets,
// the wrong application identity, or an unverifiable debug signature.
// This is package/build evidence, NOT a physical-device acceptance test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const apk = path.resolve(process.argv[2] || path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'));
const output = path.join(root, 'test-output/android-apk-metadata.json');

function sdkTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT required for APK verification');
  const buildTools = path.join(sdk, 'build-tools');
  if (!fs.existsSync(buildTools)) throw new Error('Android SDK build-tools missing');
  const versions = fs.readdirSync(buildTools).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(buildTools, version, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Android SDK tool missing: ' + name);
}

function run(executable, args, maxBuffer = 32 * 1024 * 1024) {
  return execFileSync(executable, args, { encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Include nested and future web assets, not just the current four named
// entrypoints. A symlink or special file in dist must not silently escape
// byte-level APK provenance verification.
function listBundledFiles(directory, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    if (!entry.name || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..')
      throw new Error('Unsafe bundled web asset name');
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...listBundledFiles(directory, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error('Unsupported bundled web asset type');
  }
  return files.sort();
}

function verify() {
  assert.ok(fs.statSync(apk).size > 100_000, 'APK missing or unexpectedly small');
  const badging = run(sdkTool('aapt'), ['dump', 'badging', apk]);
  const packageName = /^package:\s+name='([^']+)'/m.exec(badging)?.[1];
  const launchActivity = /^launchable-activity:\s+name='([^']+)'/m.exec(badging)?.[1];
  assert.equal(packageName, 'io.lemma.study', 'APK application ID changed');
  assert.equal(launchActivity, 'io.lemma.study.MainActivity', 'APK launcher activity changed');
  const versionCode = /^package:.*\bversionCode='([^']+)'/m.exec(badging)?.[1];
  const versionName = /^package:.*\bversionName='([^']+)'/m.exec(badging)?.[1];
  assert.ok(versionCode && versionName, 'APK version metadata missing');

  const signer = run(sdkTool('apksigner'), ['verify', '--verbose', '--print-certs', apk]);
  // Tool versions differ in digest formatting. Keep the signature check and
  // require exactly one 256-bit digest from a certificate-specific line.
  const certificateLine = signer.split(/\r?\n/).find(line =>
    /certificate.*SHA[- ]?256/i.test(line));
  const signerSha256 = certificateLine?.replace(/^.*?(?:digest|fingerprint):\s*/i, '')
    .replace(/[\s:]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signerSha256 || '')) {
    // Print field NAMES only, never signer values, paths, or private metadata.
    const labels = signer.split(/\r?\n/).filter(line => /certificate|signer/i.test(line))
      .map(line => line.split(':')[0].slice(0, 100));
    console.error('APK signer metadata labels:', labels.join(' | ') || '(none)');
    throw new Error('APK signature fingerprint unavailable');
  }

  const files = new Set(run('unzip', ['-Z', '-1', apk]).trim().split(/\r?\n/));
  const bundled = listBundledFiles(path.join(root, 'dist'));
  for (const required of ['index.html', 'lemma.html', 'test.html',
    'service-worker.js', 'manifest.webmanifest', 'icons/icon.svg']) {
    assert.ok(bundled.includes(required), 'Build output missing required asset: ' + required);
  }
  assert.ok(bundled.length <= 4096, 'Unexpected number of bundled web assets');
  const assetSha256 = {};
  for (const name of bundled) {
    const entry = 'assets/public/' + name;
    assert.ok(files.has(entry), 'APK bundled asset missing: ' + entry);
    const actual = execFileSync('unzip', ['-p', apk, entry], { maxBuffer: 32 * 1024 * 1024 });
    const expected = fs.readFileSync(path.join(root, 'dist', name));
    assert.ok(actual.equals(expected), 'APK contains stale or modified bundled asset: ' + name);
    assetSha256[name] = crypto.createHash('sha256').update(actual).digest('hex');
  }
  const metadata = {
    schema: 2, applicationId: packageName, launchActivity, versionCode, versionName,
    apkSha256: crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
    signerCertificateSha256: signerSha256, bundledAssetSha256: assetSha256
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(metadata, null, 2) + '\n');
  console.log('ok: Android APK identity, signature and exact bundled web assets');
  console.log('APK SHA-256:', metadata.apkSha256);
  console.log('Debug signer SHA-256:', signerSha256);
  console.log('Metadata:', path.relative(root, output));
}

if (require.main === module) {
  try { verify(); }
  catch (error) {
    // Avoid logging tool stderr or arbitrary archive data. This is a CI-only
    // verifier; do not leak paths or metadata from unexpected tool exceptions.
    console.error('Android APK preflight failed:', error instanceof assert.AssertionError ?
      error.message : 'SDK, archive, signature or bundled-asset check failed');
    process.exitCode = 1;
  }
}

module.exports = { listBundledFiles };
