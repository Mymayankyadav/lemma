import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM build script without type declarations
import {SHORTCUT_GLYPHS, TILE_GLYPHS, lucidePathData} from '../../../scripts/android-icons.mjs';
// @ts-expect-error plain ESM build script without type declarations
import {LAYOUTS} from '../../../scripts/brand/lemma-mark.mjs';

// N157 · v7 UX audit r3, P7 and AW14–AW16 (Owner decision E23): Android shortcut, tile and themed icons, and names.
const res = 'android/app/src/main/res/';
const read = (path: string) => readFileSync(path, 'utf8');

describe('IC4 · AW16 · one recipe for every launcher shortcut', () => {
  it('each shortcut is the selection tint with its glyph, adaptive on Android 8+ and a round tile before', () => {
    for (const [name, glyph] of Object.entries(SHORTCUT_GLYPHS as Record<string, string>)) {
      expect(read(res + 'drawable-anydpi-v26/shortcut_' + name + '.xml')).toContain('<background android:drawable="@color/lemma_tint"/>');
      const layer = read(res + 'drawable/shortcut_' + name + '_glyph.xml');
      expect(layer).toContain('android:strokeColor="@color/lemma_tint_ink"');
      expect(layer).toContain(lucidePathData(glyph));
      expect(read(res + 'drawable/shortcut_' + name + '.xml')).toContain('android:fillColor="@color/lemma_tint"');
    }
    expect(SHORTCUT_GLYPHS).toEqual({review: 'layers', focus: 'timer', capture: 'plus', inbox: 'inbox', resume: 'route'});
  });
  it('the static list has no Review (the dynamic "Review n" replaces it) and Inbox uses the inbox glyph', () => {
    const xml = read(res + 'xml/shortcuts.xml');
    expect(xml).not.toContain('shortcutId="review"');
    expect(xml).toContain('android:icon="@drawable/shortcut_inbox"');
    expect(xml).not.toMatch(/shortcut_approve|shortcut_atlas/);
    const java = read('android/app/src/main/java/io/github/mymayankyadav/lemma/Shortcuts.java');
    expect(java).toContain('R.drawable.shortcut_resume');
    expect(java).not.toContain('shortcut_atlas');
    expect(java).toContain('getMaxShortcutCountPerActivity() - 3');
    expect(read('src/platform/start.ts')).toContain("shortcuts.push({id: 'review-due', label: (home.due > 0 ? 'Review ' + home.due : 'Review').slice(0, 25), route: '/review'});");
  });
  it('the glyph converter draws lucide circles, lines and rects as paths', () => {
    expect(lucidePathData('timer')).toBe('M10,2L14,2 M12,14L15,11 M4,14a8,8 0 1,0 16,0a8,8 0 1,0 -16,0');
    expect(lucidePathData('inbox')).toMatch(/^M22,12L16,12L14,15L10,15L8,12L2,12 M/);
  });
});

describe('IC4 · each Quick Settings tile has its own glyph', () => {
  it('Focus a timer and Capture a plus, as monochrome 24 dp vectors (not the ℓ twice)', () => {
    expect(TILE_GLYPHS).toEqual({focus: 'timer', capture: 'plus'});
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/\.FocusTileService"[\s\S]*?android:icon="@drawable\/tile_focus"/);
    expect(manifest).toMatch(/\.CaptureTileService"[\s\S]*?android:icon="@drawable\/tile_capture"/);
    for (const name of ['focus', 'capture']) expect(read(res + 'drawable/tile_' + name + '.xml')).toContain('android:width="24dp"');
  });
});

describe('IC6 · AW14 · the themed icon is the ℓ and the ∎', () => {
  it('both inside the launcher\'s 66 dp safe circle', () => {
    expect(read(res + 'drawable/ic_launcher_monochrome.xml').match(/<path /g)).toHaveLength(2);
    // The art box is the inner 72 dp of a 108 dp layer; the safe circle has a 33 dp radius about the centre.
    const [x, y, q] = LAYOUTS.themed.qed as number[];
    const corner = Math.hypot((x + q - 0.5) * 72, (y + q - 0.5) * 72);
    expect(corner).toBeLessThan(33);
  });
});

describe('AW15 · one word for a planned block', () => {
  it('the channel and the setting say "Time blocks", as the app says "time block"', () => {
    expect(read('android/app/src/main/java/io/github/mymayankyadav/lemma/Channels.java')).toContain('new NotificationChannel(CALENDAR, "Time blocks",');
    expect(read('src/features/settings/v7/reminderKinds.ts')).toContain("plan:'Time blocks'");
    expect(read('src/app/v7/SearchSheet.tsx')).toContain("'New time block'");
  });
});
