import {useEffect, useState, type ReactNode} from 'react';
import {Check, Copy, ThumbsDown, ThumbsUp} from 'lucide-react';
import {IconButton} from '../../ui/v7/components';

type Rating = 'up' | 'down';
const RATINGS_KEY = 'lemma.tutor.reply-ratings';

function readRatings(): Record<string, Rating> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RATINGS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, Rating> : {};
  } catch {
    return {};
  }
}

/** The learner's thumbs on a reply, kept on this device only; nothing is sent. */
export function replyRating(id: string): Rating | undefined {
  const value = readRatings()[id];
  return value === 'up' || value === 'down' ? value : undefined;
}

function saveRating(id: string, rating: Rating | undefined) {
  try {
    const all = readRatings();
    if (rating) all[id] = rating; else delete all[id];
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  } catch {
    // Storage may be full or blocked; the thumbs still show for this visit.
  }
}

/**
 * N227 (Owner: "chat menu like this, keep copy, like and dislike and make a card from conversation icon, faded than
 * message text"): one quiet row of icons under a tutor reply. Copy puts the reply's text on the clipboard; the thumbs
 * are the learner's own note on the reply, kept on this device; Make a card and what the tutor suggested follow.
 */
export function ReplyActions({id, body, children}: {id: string; body: string; children?: ReactNode}) {
  const [rating, setRating] = useState<Rating | undefined>(() => replyRating(id));
  const [copied, setCopied] = useState<'yes' | 'no'>();
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(undefined), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const rate = (next: Rating) => {
    const value = rating === next ? undefined : next;
    setRating(value);
    saveRating(id, value);
  };
  const copy = () => {
    const done = (ok: boolean) => setCopied(ok ? 'yes' : 'no');
    try {
      void navigator.clipboard.writeText(body).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  };
  return <div className="tutor-reply-actions" role="group" aria-label="Reply actions">
    <IconButton label={copied === 'yes' ? 'Copied' : 'Copy reply'} onClick={copy}>
      {copied === 'yes' ? <Check aria-hidden="true"/> : <Copy aria-hidden="true"/>}
    </IconButton>
    <IconButton label="Good reply" aria-pressed={rating === 'up'} onClick={() => rate('up')}><ThumbsUp aria-hidden="true"/></IconButton>
    <IconButton label="Bad reply" aria-pressed={rating === 'down'} onClick={() => rate('down')}><ThumbsDown aria-hidden="true"/></IconButton>
    {children}
    {copied === 'no' && <span className="tutor-reply-note" role="status">Could not copy</span>}
  </div>;
}
