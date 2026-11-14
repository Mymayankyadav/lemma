#!/usr/bin/env node
/**
 * N7 → N123 · invariants of the Android shell, now a Capacitor app (it replaced the Trusted Web Activity):
 * the same package id as the Play listing, the /lemma/ start path, verified App Links for the website, the sign-in
 * callback, and only the permissions the plan allows (no camera, location, contacts, microphone, exact-alarm-clock
 * or usage access; Firebase only as Cloud Messaging, see below). Usage: node android/scripts/check-shell.mjs [root]
 */
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const read = path => readFileSync(join(root, path), 'utf8');
const PACKAGE = 'io.github.mymayankyadav.lemma';
const errors = [];
const fail = message => errors.push(message);

let config;
try {config = JSON.parse(read('capacitor.config.json'));} catch {fail('capacitor.config.json missing or invalid');}
if (config) {
  if (config.appId !== PACKAGE) fail('wrong package in capacitor.config.json: ' + config.appId);
  if (config.server?.appStartPath !== '/lemma/') fail('missing launch path /lemma/ in capacitor.config.json');
  if (config.server?.androidScheme !== 'https') fail('the app must load over https://localhost');
  if (config.android?.webContentsDebuggingEnabled === true) fail('WebView debugging must stay off in release builds');
}
const gradle = read('android/app/build.gradle');
if (!gradle.includes(`applicationId "${PACKAGE}"`)) fail('wrong package in android/app/build.gradle');
// Owner, 14 Nov 2026 (N163): Firebase Cloud Messaging only, for the phone's notifications. D11/D12 still hold for everything
// else: no google-services plugin (the app starts Firebase from its own four public values), no analytics, crash reporting or
// any other Firebase library.
const gradleFiles = gradle + '\n' + read('android/build.gradle');
if (/google-services/i.test(gradleFiles)) fail('Firebase is approved only for Cloud Messaging, without the google-services plugin (Owner, 14 Nov 2026)');
for (const line of gradleFiles.split('\n')) {
  if (!/^\s*(classpath|implementation|api|compileOnly|runtimeOnly|id|apply plugin)\b/.test(line) || !/firebase|gms/i.test(line)) continue;
  if (/com\.google\.firebase:firebase-messaging(:|['"])/.test(line)) continue;
  fail('Firebase is approved only for Cloud Messaging (com.google.firebase:firebase-messaging): ' + line.trim());
}

const manifest = read('android/app/src/main/AndroidManifest.xml');
const appLinks = /<intent-filter android:autoVerify="true">[\s\S]*?<data android:scheme="https" android:host="mymayankyadav\.github\.io" android:pathPrefix="\/lemma"\s*\/>[\s\S]*?<\/intent-filter>/;
if (!appLinks.test(manifest)) fail('missing asset-links (App Links) intent filter for https://mymayankyadav.github.io/lemma');
if (!manifest.includes(`android:scheme="${PACKAGE}" android:host="auth" android:path="/callback"`)) fail('missing sign-in callback intent filter');
for (const permission of ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'READ_CONTACTS', 'RECORD_AUDIO', 'USE_EXACT_ALARM',
  'PACKAGE_USAGE_STATS', 'FOREGROUND_SERVICE', 'SYSTEM_ALERT_WINDOW', 'READ_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES']) {
  if (manifest.includes(`android.permission.${permission}"`)) fail('forbidden permission ' + permission);
}
if (/android:allowBackup="true"/.test(manifest)) fail('backups must stay off (the session must not move devices)');

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log('Android shell OK');
