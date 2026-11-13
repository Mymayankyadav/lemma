/**
 * N157 · AN3 "Edges" (v7 UX audit r3, `03` §4): no Lemma gesture starts within 24 dp of the screen's left or right
 * edge, so the Inbox and review swipes, task swipes and calendar drags never fight Android's back gesture (which starts
 * there). A press at the edge still taps; only the swipe or drag is not started.
 */
export const EDGE_DP = 24;
export function fromEdge(x: number, width: number = typeof window === 'undefined' ? Infinity : window.innerWidth): boolean {
  return x < EDGE_DP || x > width - EDGE_DP;
}
