import {PAD_PAPER} from './padInk';
import {parsePadDraft, type PadDraft} from './padDraftStore';
import {PAD_BACKUP_MAX_BYTES} from './padLimits';

export {PAD_BACKUP_MAX_BYTES} from './padLimits';

function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Device-only import of the exact portable v1 backup. No identity or scope comes from a file. */
export async function readPadBackup(file: Pick<Blob, 'size' | 'arrayBuffer'>): Promise<PadDraft> {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > PAD_BACKUP_MAX_BYTES) {
    throw new Error('Choose a Pad JSON backup smaller than 1 MB.');
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size || bytes.byteLength > PAD_BACKUP_MAX_BYTES) throw new Error('The backup could not be read.');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (!hasKeys(raw, ['format', 'version', 'notes', 'ink']) || raw.format !== 'lemma-pad' || raw.version !== 1
      || !hasKeys(raw.notes, ['text', 'start', 'end', 'direction'])
      || !hasKeys(raw.ink, ['width', 'height', 'strokes'])
      || raw.ink.width !== PAD_PAPER.width || raw.ink.height !== PAD_PAPER.height) {
    throw new Error('This file is not a compatible Pad backup.');
  }
  const draft = parsePadDraft({edit: raw.notes, strokes: raw.ink.strokes});
  if (!draft) throw new Error('This Pad backup is invalid or exceeds the draft limits.');
  return draft;
}
