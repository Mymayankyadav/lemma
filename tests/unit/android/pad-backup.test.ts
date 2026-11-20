import {expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {makePadFile} from '../../../src/features/pad/padExport';
import {readPadBackup} from '../../../src/features/pad/padImport';
import {setLemmaNativeForTests, type LemmaNativePlugin} from '../../../src/platform/bridge';
import {shareFile} from '../../../src/platform/files';

it('round-trips a Pad backup through the Android share payload and file importer', async () => {
  const edit = padEdit('∫₀¹ f(x) dx = π', 0, 3, 'backward');
  const strokes = [[{x: 20, y: 30}, {x: 35, y: 50}]];
  const backup = makePadFile(edit, strokes, 'backup');
  const nativeShare = vi.fn<LemmaNativePlugin['shareFile']>().mockResolvedValue({shared: true});
  setLemmaNativeForTests({shareFile: nativeShare} as unknown as LemmaNativePlugin);
  try {
    expect(await shareFile(new Blob([backup.contents], {type: 'application/json'}), backup.filename)).toBe(true);
    expect(nativeShare).toHaveBeenCalledTimes(1);
    const [file] = nativeShare.mock.calls[0];
    expect(file).toMatchObject({name: 'lemma-pad.json', mime: 'application/json'});
    const bytes = new TextEncoder().encode(file.text);
    const restored = await readPadBackup({size: bytes.byteLength, arrayBuffer: async () => bytes.buffer});
    expect(restored).toEqual({edit, strokes});
  } finally {
    setLemmaNativeForTests(null);
  }
});
