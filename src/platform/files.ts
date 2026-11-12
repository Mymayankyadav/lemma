/**
 * AW2 (v7 UX audit r3, Owner decision E14): files the Android app hands to the system. A WebView cannot save a
 * download, so a backup goes to Android's share sheet instead (Files, Drive, email), through the app's own plugin.
 * Loaded only inside the app (Export imports it dynamically after `isNative()`).
 */
import {lemmaNative} from './bridge';

/** The backup's file name for a day, as the website's download names it. */
export function backupFileName(now: Date = new Date()): string {
  return 'lemma-backup-' + now.toISOString().slice(0, 10) + '.json';
}

/** Hand `blob` to the share sheet as `name`. Resolves true when the sheet opened; rejects when it could not. */
export async function shareFile(blob: Blob, name: string, title = 'Save your Lemma backup'): Promise<boolean> {
  const text = await blob.text();
  const native = await lemmaNative();
  const {shared} = await native.shareFile({name, mime: blob.type || 'application/json', text, title});
  return shared === true;
}
