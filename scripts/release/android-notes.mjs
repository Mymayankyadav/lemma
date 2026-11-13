#!/usr/bin/env node
/**
 * N157 · A5′ "a release page per APK" (v7 UX audit r3, `04` §8): plain words, the APK, one image. Writes the notes for a
 * GitHub Release of the Android app. The image is `docs/release/android-release.png` from the scene camera
 * (`node scripts/v7/scene-camera.mjs release`). Using these notes in `.github/workflows/android.yml` (`gh release create
 * --notes-file`) is a workflow change, so it waits for an Owner `rules:` PR; until then the release keeps its one line.
 *
 *   node scripts/release/android-notes.mjs <build-number> [changes.md] > notes.md
 */
import {readFileSync} from 'node:fs';

export const IMAGE_URL = 'https://raw.githubusercontent.com/Mymayankyadav/lemma/main/docs/release/android-release.png';
/** The release page's text. `changes` are short lines in plain words (no item ids); empty means none were written. */
export function releaseNotes(build, changes = []) {
  if (!/^[1-9]\d{0,8}$/.test(String(build))) throw new Error('build must be the CI build number, got ' + build);
  const lines = changes.map(line => line.trim()).filter(Boolean);
  return [
    `![Lemma for Android](${IMAGE_URL})`,
    '',
    `## Lemma for Android 2.0.${build}`,
    '',
    lines.length ? '**What changed**\n\n' + lines.map(line => '- ' + line.replace(/^[-*]\s*/, '')).join('\n') : 'Fixes and small improvements.',
    '',
    '**Install:** download `Lemma.apk` below and open it on your phone. The first time, Android asks you to allow installs from this source.',
    'It is signed with the same key as earlier builds, so it updates Lemma in place and keeps your data.',
    '',
    'In the app, Settings › Data and account › About this app shows your version and a dot when a newer one is here.',
  ].join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [build, changesFile] = process.argv.slice(2);
  const changes = changesFile ? readFileSync(changesFile, 'utf8').split('\n') : [];
  process.stdout.write(releaseNotes(build, changes));
}
