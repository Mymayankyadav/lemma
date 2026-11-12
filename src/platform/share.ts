/**
 * N123 · N4 share-to-Lemma. Text and links open the Capture sheet with the text filled in; PDF, .tex and .md files
 * start a New path with them as sources (the existing upload pipeline). Pure routing plus a one-shot hand-off store.
 */
import type {SharedItem} from './bridge';

export type ShareRoute = {kind: 'capture'; text: string} | {kind: 'new-path'; files: NonNullable<SharedItem['files']>} | {kind: 'unsupported'; reason: string};

const sourceMime = /^(application\/pdf|application\/x-tex|text\/x-tex|text\/markdown|text\/x-markdown)$/;
const sourceName = /\.(pdf|tex|latex|ltx|md|markdown)$/i;

/** Where one shared item goes. Pure. */
export function routeShare(item: SharedItem): ShareRoute {
  if (item.kind === 'text') {
    const text = [item.subject?.trim(), item.text?.trim()].filter(Boolean).join(' — ').slice(0, 500);
    return text ? {kind: 'capture', text} : {kind: 'unsupported', reason: 'Nothing to add was shared.'};
  }
  const files = (item.files ?? []).filter(file => sourceMime.test(file.mime) || sourceName.test(file.name));
  if (files.length) return {kind: 'new-path', files};
  return {kind: 'unsupported', reason: 'Lemma can add PDF, .tex and .md files as sources, and text or links as captures.'};
}

/** Files waiting for the New path sheet (read once). */
let pendingSources: File[] = [];
export function holdSharedSources(files: File[]): void {pendingSources = files;}
export function takeSharedSources(): File[] {const files = pendingSources; pendingSources = []; return files;}

/** Text waiting for the Capture sheet (read once). */
let pendingCapture: string | null = null;
export function holdCaptureText(text: string): void {pendingCapture = text;}
export function takeCaptureText(): string | null {const text = pendingCapture; pendingCapture = null; return text;}
