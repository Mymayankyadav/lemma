import {useEffect, useRef, type ReactNode} from 'react';
import {Sheet} from '../../ui/v7/components';

/**
 * N228 (Owner: "full screen scratch pad editing for both scratch and equation"): while `active`, the drawing surface is
 * shown in the kit's modal Sheet, stretched over the whole screen (see tutor.css), instead of in the composer. The Sheet
 * brings what a full-screen surface needs: the page behind is inert and does not scroll, Tab stays inside, Escape and
 * the Sheet's own close leave. The drawing state stays in the component that owns it, so leaving keeps the drawing.
 * The surface is a new element in each place, so focus goes back to the full-screen toggle (data-fullscreen-toggle).
 */
export function FullscreenPaper({active, onExit, label, children}: {active: boolean; onExit: () => void; label: string; children: ReactNode}) {
  const anchor = useRef<HTMLSpanElement>(null), was = useRef(active);
  useEffect(() => {
    if (was.current && !active) {
      const page = anchor.current?.closest<HTMLElement>('.lemma-tutor');
      requestAnimationFrame(() => page?.querySelector<HTMLElement>('[data-fullscreen-toggle]')?.focus({preventScroll: true}));
    }
    was.current = active;
  }, [active]);
  return <>
    <span ref={anchor} hidden/>
    {active
      ? <Sheet open onClose={onExit} title={label} hideTitle full containFocus><div className="tutor-paper-full">{children}</div></Sheet>
      : children}
  </>;
}
