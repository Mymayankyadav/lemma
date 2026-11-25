import type {PointerEvent} from 'react';
import type {LatentChoice} from './latentInkPolicy';
import type {KeyInkView} from './useKeyInk';

const holdCaret = (event: PointerEvent) => event.preventDefault();

/**
 * N249 · The readings of a symbol drawn over the keys, in the strip's three slots with the same markup and styles as
 * the symbol suggestions (best in the middle). After an insert the middle slot is the inserted symbol (a tap keeps
 * it) and the others replace it in place.
 */
export function KeyInkWords({view, disabled, onChoose}: {
  view: KeyInkView; disabled: boolean; onChoose: (choice: LatentChoice) => void;
}) {
  const choices: (LatentChoice | undefined)[] = view.kind === 'held' ? [view.choices[1], view.choices[0], view.choices[2]]
    : view.kind === 'inserted' ? [view.alternatives[0], {symbol: view.symbol, confidence: 1}, view.alternatives[1]]
    : [undefined, undefined, undefined];
  const preferred = view.kind === 'inserted' || view.kind === 'held' && view.preferred;
  return <div className="sugg symbol-words" role="group" aria-label="Drawn symbol" data-ink={view.kind}>
    {choices.map((choice, index) => <button type="button" key={index} disabled={disabled || !choice}
      aria-label={!choice ? (view.kind === 'reading' ? 'Reading the drawing' : 'No symbol')
        : view.kind === 'inserted' ? (index === 1 ? 'Keep ' : 'Replace with ') + choice.symbol.glyph + ' (' + choice.symbol.name + ')'
        : 'Insert ' + choice.symbol.glyph + ' (' + choice.symbol.name + ')'}
      title={choice?.symbol.tex} className={index === 1 && choice && preferred ? 'preferred' : ''}
      onPointerDown={holdCaret} onClick={() => {if (choice) onChoose(choice);}}>
      {choice ? <span className="symbol-glyph">{choice.symbol.glyph}</span> : <span aria-hidden="true" className="writing-aid-empty">·</span>}
    </button>)}
  </div>;
}
