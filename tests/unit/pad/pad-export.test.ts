import {expect, test} from 'vitest';
import {makePadFile} from '../../../src/features/pad/padExport';
import {readPadBackup} from '../../../src/features/pad/padImport';
import {PAD_BACKUP_MAX_BYTES, PAD_NOTE_MAX} from '../../../src/features/pad/padLimits';
import {PAD_INK_LIMIT, PAD_PAPER} from '../../../src/features/pad/padInk';
import {padEdit} from '../../../src/features/pad/padEdit';

function asFile(contents: string) {
  const bytes = new TextEncoder().encode(contents);
  return {size: bytes.byteLength, arrayBuffer: async () => bytes.buffer};
}

test('a maximum-sized valid Pad backup round-trips text, selection and every completed ink point', async () => {
  // JSON must escape these characters, exercising the portable byte bound too.
  const edit = padEdit('\u0000'.repeat(PAD_NOTE_MAX), 4, PAD_NOTE_MAX, 'backward');
  const strokes = Array.from({length: PAD_INK_LIMIT.strokes}, () =>
    Array.from({length: PAD_INK_LIMIT.points}, () => ({x: PAD_PAPER.width, y: PAD_PAPER.height})));
  const exported = makePadFile(edit, strokes, 'backup');
  const file = asFile(exported.contents);
  expect(file.size).toBeLessThanOrEqual(PAD_BACKUP_MAX_BYTES);
  expect(await readPadBackup(file)).toEqual({edit, strokes});
});

test('an oversized working note cannot masquerade as a restorable backup but remains fully readable', () => {
  const text = 'x'.repeat(PAD_NOTE_MAX + 1), edit = padEdit(text);
  expect(() => makePadFile(edit, [], 'backup')).toThrow('Export a readable Pad');
  const readable = makePadFile(edit, [], 'readable');
  expect(readable.type).toBe('text/html;charset=utf-8');
  expect(readable.contents).toContain(text);
  expect(edit.text).toHaveLength(PAD_NOTE_MAX + 1);
});
