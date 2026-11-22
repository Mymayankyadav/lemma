export const UI_BUDGET = {hubChrome: 132, detailChrome: 136, overlap: 0.25} as const;

/** Serializable so the capture runner and Playwright assertions measure the same browser state. */
export function measureV7Design() {
  const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
  const scope = dialog ?? document.body;
  const viewport = {width: innerWidth, height: innerHeight};
  const roleNames = ['caption', 'supporting', 'body', 'reading', 'lead', 'subhead', 'headline', 'numeric-md', 'title', 'display', 'numeric-xl'];
  const probe = document.createElement('span');
  probe.hidden = true;
  document.body.append(probe);
  const scale = roleNames.map(role => {
    probe.style.fontSize = `var(--v7-type-${role})`;
    return parseFloat(getComputedStyle(probe).fontSize);
  });
  probe.remove();
  const visible = (element: Element) => {
    if (element.closest('[inert], [aria-hidden=true], dialog:not([open]), .sr-only, .v7-sr-only')) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility === 'visible' && box.width > 1 && box.height > 1;
  };
  const inViewport = (box: DOMRect) => box.bottom > 0 && box.top < viewport.height && box.right > 0 && box.left < viewport.width;
  const pinned = Array.from(scope.querySelectorAll('.v7-pinned-dock')).filter(element =>
    visible(element) && getComputedStyle(element).position === 'fixed').map(element => ({element, box:element.getBoundingClientRect()}));
  const clipped = (box:DOMRect,element:Element) => {
    if(!inViewport(box))return true;
    const x=(box.left+box.right)/2,y=(box.top+box.bottom)/2;
    for (const cover of pinned) {
      if (x>=cover.box.left && x<=cover.box.right && y>=cover.box.top && y<=cover.box.bottom && !cover.element.contains(element)
          && cover.element.contains(document.elementFromPoint(x,y))) return true;
    }
    for(let parent:Element|null=element;parent&&parent!==scope;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      if(!/hidden|clip|scroll|auto/.test(style.overflow+style.overflowX+style.overflowY))continue;
      const bounds=parent.getBoundingClientRect();
      if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return true;
    }
    return false;
  };
  const label = (element: Element) => [element.tagName.toLowerCase(), element.classList[0]].filter(Boolean).join('.');
  const offFonts = new Set<string>(), offSizes = new Set<string>(), raw = new Set<string>();
  const textBoxes: {box: DOMRect; element: Element}[] = [];
  const words = {view: 0, all: 0};
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim(), element = node.parentElement;
    if (!text || !element || !visible(element) || element.closest('script, style, .katex-mathml, svg title')) continue;
    if (!element.closest('.v7-tabbar')) {
      const count = text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
      words.all += count;
      const range = document.createRange();
      range.selectNodeContents(node);
      const boxes = Array.from(range.getClientRects()).filter(box=>!clipped(box,element));
      if (boxes.length) {
        for(const word of (node.textContent??'').matchAll(/[^\s]+/g)){
          if(!/[\p{L}\p{N}]/u.test(word[0]))continue;
          range.setStart(node,word.index!);range.setEnd(node,word.index!+word[0].length);
          if(Array.from(range.getClientRects()).some(box=>!clipped(box,element)))words.view++;
        }
        if (!element.closest('svg, canvas, .katex, [data-ink-canvas]')) {
          for (const box of boxes) textBoxes.push({box, element});
        }
      }
    }
    if (/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|atlas-owner-\d[\w.-]*|v\d+\.\d+\.\d+)\b/.test(text)
      && !element.closest('[data-v7-diagnostics], pre, code')) raw.add(label(element));
    const style = getComputedStyle(element);
    if (!/Lemma v7|KaTeX/i.test(style.fontFamily)) offFonts.add(label(element) + ' ' + style.fontFamily.split(',')[0]);
    if (!element.closest('.katex, .math-keyboard, .tutor-keys, [data-v7-keyboard]') && !scale.some(size => Math.abs(size - parseFloat(style.fontSize)) < 0.1))
      offSizes.add(label(element) + ' ' + style.fontSize);
  }
  const native = Array.from(scope.querySelectorAll("details > summary, select, input[type=date], input[type=time], input[type=datetime-local]"))
    .filter(visible).map(label);
  const overlaps = new Set<string>();
  textBoxes.sort((a, b) => a.box.top - b.box.top);
  for (let i = 0; i < textBoxes.length; i++) {
    const a = textBoxes[i];
    for (let j = i + 1; j < textBoxes.length && textBoxes[j].box.top < a.box.bottom; j++) {
      const b = textBoxes[j];
      if (a.element === b.element || a.element.contains(b.element) || b.element.contains(a.element)) continue;
      // Scrolling rails, graphics labels and semantic tabs have their own clipping and collision rules.
      if (a.element.closest('[data-v7-scroll-rail]') || b.element.closest('[data-v7-scroll-rail]')) continue;
      const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (width > 0 && height > 0 && width * height > 0.25 * Math.min(a.box.width * a.box.height, b.box.width * b.box.height)) {
        overlaps.add([label(a.element), label(b.element)].sort().join(' / '));
      }
    }
  }

  const top = new Set<number>(), bottom = new Set<number>();
  for (const element of scope.querySelectorAll('header, nav, [data-inset], .v7-dock')) {
    if (!visible(element)) continue;
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    if (!['fixed', 'sticky'].includes(style.position) || box.width < viewport.width / 2) continue;
    const edge = box.top < viewport.height / 2 ? top : bottom;
    if (edge === top && box.top > 12 || edge === bottom && box.bottom < viewport.height - 24) continue;
    for (let y = Math.max(0, Math.round(box.top)); y < Math.min(viewport.height, Math.round(box.bottom)); y++) edge.add(y);
  }
  const picture = scope.querySelector('.v7-atlas-sky');
  let map: {clear: number; extent: number | null} | null = null;
  if (picture) {
    const box = picture.getBoundingClientRect();
    let total = 0, clear = 0;
    for (let y = box.top + 8; y < Math.min(box.bottom, viewport.height); y += 16) {
      for (let x = box.left + 8; x < box.right; x += 16) {
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        total++;
        if (picture.contains(hit)) clear++;
      }
    }
    const rendered = Array.from(picture.querySelectorAll('[data-star-id], .v7-atlas-star')).map(node => node.getBoundingClientRect()).filter(inViewport);
    const extent = rendered.length ? Math.min(box.bottom, Math.max(...rendered.map(rect => rect.bottom))) - Math.max(box.top, Math.min(...rendered.map(rect => rect.top))) : null;
    map = {clear: total ? clear / total : 0, extent: picture.hasAttribute('data-drawn-extent')
      ? Number(picture.getAttribute('data-drawn-extent')) : extent === null ? null : extent / box.height};
  }
  return {
    chrome: dialog ? null : {top: top.size, bottom: bottom.size, total: top.size + bottom.size},
    words, offFonts: [...offFonts].sort(), offSizes: [...offSizes].sort(), native: [...new Set(native)].sort(),
    overlaps: [...overlaps].sort(), raw: [...raw].sort(), picture: map,
    detail: document.querySelector('.v7-shell')?.getAttribute('data-immersive') === 'true',
  };
}
