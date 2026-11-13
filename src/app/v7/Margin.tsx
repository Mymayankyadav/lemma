import {useEffect, useState, type ReactNode} from 'react';
import {isFlagOn} from '../../flags';
import {Button, Sheet} from '../../ui/v7/components';
import {useMinWidth} from './useMinWidth';
import './margin.css';

/** One note in the margin: a heading and what is already reachable from the page behind a link. */
export type MarginNote = {title: string; body: ReactNode};

const KEY = 'lemma.v7.margin.hidden';
function readHidden() {
  try {return localStorage.getItem(KEY) === '1';} catch {return false;}
}
function writeHidden(hidden: boolean) {
  try {localStorage.setItem(KEY, hidden ? '1' : '0');} catch {/* a blocked store only forgets the choice */}
}
/** M toggles the margin, except while typing or with a modifier held. */
export function isMarginKey(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'target'>) {
  if (event.altKey || event.ctrlKey || event.metaKey || (event.key !== 'm' && event.key !== 'M')) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]');
}

/**
 * N157 · U1 S11, the margin (flag `v7Margin`, off by default). From 1100 px a 292 px column to the right of the page,
 * behind a 2 px rule in the margin red of the icon, holding notes that already exist behind links (sources and pages,
 * why this card, the last reviews, prerequisites). Nothing in it is needed to finish a task, so hiding it (M, remembered
 * on this device) never blocks anyone. Below 1100 px the same notes open as a sheet from one "Margin" button. Screen
 * readers meet it as a complementary landmark named "Notes". `sheet={false}` keeps a narrow window free of the button
 * (the review round, whose card already shows its source).
 */
export function Margin({notes, sheet = true}: {notes: MarginNote[]; sheet?: boolean}) {
  const on = isFlagOn('v7Margin'), wide = useMinWidth(1100);
  const [hidden, setHidden] = useState(readHidden), [open, setOpen] = useState(false);
  useEffect(() => {
    if (!on || !wide) return;
    const key = (event: KeyboardEvent) => {
      if (!isMarginKey(event)) return;
      event.preventDefault();
      setHidden(value => {writeHidden(!value); return !value;});
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on, wide]);
  if (!on || !notes.length || (!wide && !sheet)) return null;
  const list = <div className="v7-margin-notes">{notes.map(note => <section key={note.title} className="v7-margin-note" aria-label={note.title}>
    <h2 className="v7-margin-title">{note.title}</h2>{note.body}</section>)}</div>;
  if (wide) return hidden
    ? <button type="button" className="v7-margin-show" aria-keyshortcuts="M" onClick={() => {writeHidden(false); setHidden(false);}}>Show notes</button>
    : <aside className="v7-margin" aria-label="Notes" aria-keyshortcuts="M"><div className="v7-margin-inner">{list}</div></aside>;
  return <>
    <Button small variant="ghost" className="v7-margin-button" onClick={() => setOpen(true)}>Margin</Button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Notes"><aside aria-label="Notes">{list}</aside></Sheet>
  </>;
}
