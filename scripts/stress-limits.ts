/** ST-0 acceptance budgets, shared by the browser suite and downstream ST fixes. */
export type StressMeasurement = {
  route: string;
  nodes: number;
  horizontalOverflow: number;
  smallText: number;
  smallMath: number;
  smallTargets: number;
  minCircleGap: number | null;
  durationMs: number;
  cpuThrottle: number;
  requestCount: number;
  transferBytes: number;
};

/** Return every failed hard budget; baseline runs record these until ST-1…ST-7 resolve them. */
export function stressViolations(m: StressMeasurement): string[] {
  const failures: string[] = [];
  if (m.horizontalOverflow > 1) failures.push('horizontal overflow');
  if (m.nodes >= 1500) failures.push('1500 DOM nodes');
  if (m.smallText > 0) failures.push('text below 12px');
  if (m.smallMath > 0) failures.push('maths below 16px');
  if (m.smallTargets > 0) failures.push('tap target below 44px');
  if (m.minCircleGap !== null && m.minCircleGap < 8) failures.push('marks closer than 8px');
  if (!Number.isFinite(m.durationMs) || m.durationMs < 0) failures.push('invalid first render timing');
  // A missing/zero/invalid CPU rate must not silently bypass the 4× gate.
  // 1× is valid for the other, intentionally unthrottled route measurements.
  if (!Number.isFinite(m.cpuThrottle) || m.cpuThrottle <= 0) failures.push('invalid CPU throttling evidence');
  if (m.cpuThrottle >= 4 && m.durationMs >= 4000) failures.push('4x CPU first render >= 4s');
  // The transfer budget applies to live API calls, not downloaded app assets.
  if (m.route === '/' && m.requestCount > 3) failures.push('Today exceeds 3 API requests');
  if (m.route === '/insights' && m.requestCount > 1) failures.push('Insights exceeds 1 API request');
  if ((m.route === '/' || m.route === '/insights') && m.transferBytes > 200_000) {
    failures.push('aggregate transfer exceeds 200kB');
  }
  return failures;
}
