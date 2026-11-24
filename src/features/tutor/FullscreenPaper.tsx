import {useEffect, useRef, useState, type ReactNode} from 'react';
import {RotateCw} from 'lucide-react';
import {Sheet} from '../../ui/v7/components';
import {isNative} from '../../platform/native';

/** How the full-screen paper is turned: upright, or a quarter turn either way (landscape). Kept while the app runs. */
type Turn = 0 | 90 | 270;
let remembered: Turn = 0;
const NEXT: Record<Turn, Turn> = {0: 90, 90: 270, 270: 0};
const TURN_LABEL: Record<Turn, string> = {0: 'Landscape', 90: 'Landscape, other way', 270: 'Portrait'};

function usePortrait() {
  const [portrait, setPortrait] = useState(() => typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)').matches : true);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(orientation: portrait)');
    const change = () => setPortrait(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return portrait;
}

/**
 * N228 (Owner: "full screen scratch pad editing for both scratch and equation"; "add landscape mode too … which means
 * they are rotated before sending to the model"): while `active`, the drawing surface is shown in the kit's modal Sheet,
 * stretched over the whole screen (see keyboard.css), instead of in the composer. The Sheet brings what a full-screen
 * surface needs: the page behind is inert and does not scroll, Tab stays inside, Escape and the Sheet's own close leave.
 * The drawing state stays in the component that owns it, so leaving keeps the drawing.
 *
 * Android supplies the viewport when the device rotates, including its system rotation suggestion. A browser with a
 * portrait viewport can also turn the paper manually. The canvas keeps strokes upright in paper coordinates.
 * The surface is a new element in each place, so focus goes back to the full-screen toggle (data-fullscreen-toggle).
 */
export function FullscreenPaper({active, onExit, label, children}: {active: boolean; onExit: () => void; label: string; children: ReactNode}) {
  const anchor = useRef<HTMLSpanElement>(null), was = useRef(active);
  const [turn, setTurn] = useState<Turn>(remembered);
  const portrait = usePortrait();
  useEffect(() => {
    if (was.current && !active) {
      const page = anchor.current?.closest<HTMLElement>('.lemma-tutor');
      requestAnimationFrame(() => page?.querySelector<HTMLElement>('[data-fullscreen-toggle]')?.focus({preventScroll: true}));
    }
    was.current = active;
  }, [active]);
  const manualRotation = portrait && !(isNative() || document.documentElement.hasAttribute('data-native-app'));
  const turned: Turn = manualRotation ? turn : 0;
  return <>
    <span ref={anchor} hidden/>
    {active
      ? <Sheet open onClose={onExit} title={label} hideTitle full containFocus>
        <div className="tutor-paper-safe">
          <div className="tutor-paper-full" data-turn={turned || undefined}>{children}</div>
          {manualRotation && <button type="button" className="tutor-paper-rotate" aria-label={TURN_LABEL[turned]} title={TURN_LABEL[turned]}
            data-turn-state={turned} onClick={() => {remembered = NEXT[turned]; setTurn(remembered);}}><RotateCw aria-hidden="true"/></button>}
        </div>
      </Sheet>
      : children}
  </>;
}
