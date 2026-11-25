import type {PointerEvent} from 'react';
import type {LatentChoice} from './latentInkPolicy';
import type {LatentView} from './useLatentInk';

interface Props {
  view: LatentView;
  keepSelection: (event: PointerEvent<HTMLButtonElement>) => void;
  onChoose: (choice: LatentChoice) => void;
  onClear: () => void;
}

/** N248 · Three readings of the drawing, or, after an insert, the other two as one-tap replacements. */
export function LatentInkStrip({view, keepSelection, onChoose, onClear}: Props) {
  const choices = view.kind === 'held' ? view.choices : view.kind === 'inserted' ? view.alternatives : [];
  const status = view.kind === 'reading' ? 'Reading the drawing…'
    : view.kind === 'held' ? (view.choices.length ? view.preferred ? 'Goes in when you move on, or choose:' : 'Choose a symbol:'
      : 'No symbol recognised.')
    : view.kind === 'inserted' ? `Inserted ${view.symbol.glyph}${view.alternatives.length ? '. Replace with:' : '.'}`
    : view.kind === 'notice' ? view.message : 'Draw a symbol over the keys.';
  return <div role="group" aria-label="Drawn symbol" className="pad-latent-strip">
    <p role="status" aria-live="polite">{status}</p>
    {choices.map((choice, index) => <button key={choice.symbol.id} type="button" onPointerDown={keepSelection}
      aria-label={(view.kind === 'inserted' ? 'Replace with ' : 'Insert ') + choice.symbol.name}
      data-preferred={view.kind === 'held' && view.preferred && index === 0}
      onClick={() => onChoose(choice)}>{choice.symbol.glyph}</button>)}
    {(view.kind === 'held' || view.kind === 'reading') && <button type="button" className="pad-latent-clear"
      onPointerDown={keepSelection} onClick={onClear}>Clear drawing</button>}
  </div>;
}
