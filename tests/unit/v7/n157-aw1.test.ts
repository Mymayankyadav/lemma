import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

// N157 · AW1 (Owner decision E5): the app honours the system font size, capped at 200%. The policy is unit-tested in
// Java (android/app/src/test/.../TextZoomPolicyTest.java, run by the Android workflow); this checks the wiring.
const java = (name: string) => readFileSync('android/app/src/main/java/io/github/mymayankyadav/lemma/' + name + '.java', 'utf8');
describe('AW1 · the system font size in the app', () => {
  it('the WebView text zoom follows the font scale, from 100% to 200%', () => {
    const policy = java('TextZoomPolicy');
    expect(policy).toContain('static final int MIN = 100;');
    expect(policy).toContain('static final int MAX = 200;');
    expect(policy).toContain('return Math.max(MIN, Math.min(MAX, percent));');
    const activity = java('MainActivity');
    expect(activity).toContain('applyTextZoom(getResources().getConfiguration());');
    expect(activity).toContain('applyTextZoom(configuration);');
    expect(activity).toContain('getSettings().setTextZoom(TextZoomPolicy.textZoom(configuration.fontScale));');
    expect(readFileSync('android/app/src/test/java/io/github/mymayankyadav/lemma/TextZoomPolicyTest.java', 'utf8')).toContain('TextZoomPolicy.textZoom(2.4f)');
  });
});
