/** Hide the seven-day chart when every column is empty. A missing forecast
 * is not evidence of upcoming work; nonzero days keep the same chart. */
export function hasNonzeroForecast(days: readonly { due: number }[]): boolean {
  return days.some(({ due }) => Number.isFinite(due) && due > 0);
}
