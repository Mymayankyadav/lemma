import {initializePadInk, PAD_PAPER, padStrokePath, type PadStrokes} from './padInk';
import {padEdit, type PadEdit} from './padEdit';

interface PadFile {filename: string; type: string; contents: string}
type Format = 'backup' | 'readable';

/** Explicit export of the current local Pad only. No owner, checkpoint or provider metadata. */
export function makePadFile(edit: PadEdit, strokes: PadStrokes, format: Format): PadFile {
  const ink = initializePadInk(strokes);
  if (!ink) throw new Error('Invalid Pad ink');
  const notes = padEdit(edit.text, edit.start, edit.end, edit.direction);
  if (format === 'backup') {
    const envelope = {format: 'lemma-pad', version: 1, notes, ink: {...PAD_PAPER, strokes: ink.strokes}};
    return {filename: 'lemma-pad.json', type: 'application/json', contents: JSON.stringify(envelope)};
  }
  const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const paths = ink.strokes.map(stroke => '<path d="' + padStrokePath(stroke) + '"/>').join('');
  const viewBox = '0 0 ' + PAD_PAPER.width + ' ' + PAD_PAPER.height;
  const contents = '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Lemma Pad</title>'
    + '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'
    + '<style>body{font:1rem system-ui;margin:2rem;color:#111;background:white}'
    + 'pre{white-space:pre-wrap;overflow-wrap:anywhere}svg{width:100%;max-width:640px;border:1px solid #aaa}</style>'
    + '<main><h1>Lemma Pad</h1><h2>Notes</h2><pre>\n' + escapeText(notes.text) + '</pre>'
    + '<h2>Ink</h2><svg role="img" aria-label="Exported Pad ink" xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox
    + '"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
    + paths + '</g></svg></main></html>';
  return {filename: 'lemma-pad.html', type: 'text/html;charset=utf-8', contents};
}

export function startPadDownload(file: PadFile) {
  const url = URL.createObjectURL(new Blob([file.contents], {type: file.type}));
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = file.filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser finish consuming the object URL, including on mobile.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
