/** Convert a scheduled-card count to a safe display value. Malformed counts
 * must never poison the chart's scale or leak NaN/Infinity into the UI. */
export function forecastDueCount(due: number): number {
  return Number.isFinite(due) && due > 0 ? Math.max(1, Math.floor(due)) : 0;
}

/** Hide the seven-day chart when every column is empty. A missing forecast
 * is not evidence of upcoming work; nonzero days keep the same chart. */
export function hasNonzeroForecast(days: readonly { due: number }[]): boolean {
  return days.some(({ due }) => forecastDueCount(due) > 0);
}
