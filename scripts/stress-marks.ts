/**
 * ST-0 SVG count-mark spacing. Marks are explicit so decorative icons,
 * baselines, target rings and stacked segments are not mistaken for distinct
 * data points. Return the smallest separation capped at the 8px budget.
 * Every pair is considered regardless of DOM order (x-sorted sweep).
 */
export function measureSvgMarks(): number | null {
  let best = 8;
  let sawPair = false;
  for (const svg of document.querySelectorAll("svg")) {
    const marks = Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-stress-mark], [data-atlas-bundle-circle]"))
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ el, rect }) => {
        const style = getComputedStyle(el);
        return rect.width >= 0 && rect.height >= 0 &&
          (rect.width > 0 || rect.height > 0) &&
          style.display !== "none" && style.visibility !== "hidden";
      })
      .sort((a, b) => a.rect.left - b.rect.left);
    if (marks.length < 2) continue;
    sawPair = true;
    for (let i = 0; i < marks.length; i++) {
      const a = marks[i];
      for (let j = i + 1; j < marks.length; j++) {
        const b = marks[j];
        // All gaps >= 8 are equally passing; stop the sweep at that bound.
        if (b.rect.left > a.rect.right + 8) break;
        const bothCircles = a.el.tagName.toLowerCase() === "circle" &&
          b.el.tagName.toLowerCase() === "circle";
        let gap: number;
        if (bothCircles) {
          const ax = a.rect.left + a.rect.width / 2;
          const ay = a.rect.top + a.rect.height / 2;
          const bx = b.rect.left + b.rect.width / 2;
          const by = b.rect.top + b.rect.height / 2;
          // getBoundingClientRect is in CSS pixels, including SVG scaling.
          const radiusA = Math.max(a.rect.width, a.rect.height) / 2;
          const radiusB = Math.max(b.rect.width, b.rect.height) / 2;
          gap = Math.max(0, Math.hypot(ax - bx, ay - by) - radiusA - radiusB);
        } else {
          const dx = Math.max(0, a.rect.left - b.rect.right, b.rect.left - a.rect.right);
          const dy = Math.max(0, a.rect.top - b.rect.bottom, b.rect.top - a.rect.bottom);
          gap = Math.hypot(dx, dy);
        }
        if (gap < best) best = gap;
        if (best === 0) return 0;
      }
    }
  }
  return sawPair ? best : null;
}
