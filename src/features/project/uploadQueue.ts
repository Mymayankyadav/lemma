/** Keep the currently processed PDF and the oldest queued job visible, while
 * bounding the recent queue window at 20 entries for 100-file batches. */
export function visibleUploadQueue<T extends { phase: string }>(queue: readonly T[]): T[] {
  const recent = queue.slice(-20);
  const active = queue.find(item =>
    item.phase === "reading" || item.phase === "uploading" || item.phase === "saving"
  ) ?? queue.find(item => item.phase === "queued");
  return active && !recent.includes(active) ? [active, ...recent] : recent;
}
