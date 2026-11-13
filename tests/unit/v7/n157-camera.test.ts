import {describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import {CLOCK, SCENES, frameHtml} from '../../../scripts/v7/scene-camera.mjs';
// @ts-expect-error plain ESM script without type declarations
import {IMAGE_URL, releaseNotes} from '../../../scripts/release/android-notes.mjs';
import {readFileSync, existsSync} from 'node:fs';

// N157 · G1 the scene camera and A5′ the Android release page.
describe('G1 · one command for every picture made from the app', () => {
  it('holds the install screenshots (as N133 made them) and the release image', () => {
    expect(SCENES['install-day']).toMatchObject({hash: '/', scheme: 'light', phone: [360, 640], scale: 3, out: 'public/screenshots/today-day-1080x1920.png'});
    expect(SCENES['install-night']).toMatchObject({scheme: 'dark', out: 'public/screenshots/today-night-1080x1920.png'});
    expect(SCENES.release.frame.size).toEqual([1200, 630]);
    expect(CLOCK).toBe('2026-11-12T10:20:00+05:30');
    expect(readFileSync('scripts/v7/install-shots.mjs', 'utf8')).toContain("await shoot(['install-day', 'install-night'], process.argv[2]);");
    expect(existsSync('docs/release/android-release.png')).toBe(true);
  });
  it('frames a shot in a phone outline with a serif caption on paper', () => {
    const html = frameHtml({shot: 'data:image/png;base64,AA', size: [1200, 630], title: 'Lemma for Android', line: 'A line'});
    expect(html).toContain('width:1200px;height:630px');
    expect(html).toContain('<img src="data:image/png;base64,AA"');
    expect(html).toContain('var(--v7-serif');
    expect(html).toContain('Lemma for Android');
  });
});

describe('A5′ · a release page per APK: plain words, the APK, one image', () => {
  it('writes the notes', () => {
    const notes = releaseNotes(42, ['- Review counts up when the round changes', '', '* Sheets drag down to close']);
    expect(notes.startsWith(`![Lemma for Android](${IMAGE_URL})`)).toBe(true);
    expect(notes).toContain('## Lemma for Android 2.0.42');
    expect(notes).toContain('- Review counts up when the round changes\n- Sheets drag down to close');
    expect(notes).toContain('download `Lemma.apk` below');
    expect(releaseNotes(7)).toContain('Fixes and small improvements.');
    expect(() => releaseNotes('2.0.7')).toThrow(/build number/);
  });
});
