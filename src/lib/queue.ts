import type {
  CardState,
  QueueFilter,
  ReviewItem,
  Settings,
} from "../data/types";
import type { DailyCounts } from "./derive";
import { dueToday } from "./derive";
import { studyDayBounds } from "./calendar";
export type QueueSettings = Pick<
  Settings,
  | "newPerDay"
  | "reviewsPerDay"
  | "rolloverHour"
  | "timeZone"
  | "learnAheadMinutes"
  | "mixDecks"
>;
export interface FilterMetadata {
  sessionForCard?: Readonly<Record<string, string>>;
  conceptsForCard?: Readonly<Record<string, readonly string[]>>;
}
export interface QueueOptions extends DailyCounts, FilterMetadata {
  filter?: QueueFilter;
}
export interface ReviewQueue {
  learning: ReviewItem[];
  reviews: ReviewItem[];
  fresh: ReviewItem[];
  sinceNew: number;
  reviewsPerNew: number;
  lastCheckpoint: string | null;
  total: number;
  answered: number;
  settings: QueueSettings;
}
export function filterReviewItems(
  items: readonly ReviewItem[],
  filter: QueueFilter,
  metadata: FilterMetadata = {},
): ReviewItem[] {
  return items.filter((item) => {
    if (
      filter.decks.length &&
      !filter.decks.some(
        (key) =>
          key === `project:${item.projectSlug}` ||
          key === `cp:${item.projectSlug}:${item.checkpointCode}`,
      )
    )
      return false;
    if (filter.newOnly && item.state.state !== 0) return false;
    if (!filter.includeNew && item.state.state === 0) return false;
    if (
      filter.sessionId &&
      metadata.sessionForCard?.[item.cardId] !== filter.sessionId
    )
      return false;
    if (
      filter.conceptSlug &&
      !metadata.conceptsForCard?.[item.cardId]?.includes(filter.conceptSlug)
    )
      return false;
    return true;
  });
}
const checkpointKey = (item: ReviewItem) =>
  `${item.projectSlug}:${item.checkpointCode ?? ""}`;
/** Adapters already apply limits; this is also safe for raw eligible inputs in tests/tools. */
export function buildQueue(
  items: readonly ReviewItem[],
  settings: QueueSettings,
  options: QueueOptions = {},
): ReviewQueue {
  const now = options.now ?? Date.now();
  let pool = dueToday(items, settings, options);
  if (options.filter) pool = filterReviewItems(pool, options.filter, options);
  // Select one sibling per note, prioritizing learning, then mature reviews, then new cards.
  const priority = (item: ReviewItem) =>
    item.state.state === 1 || item.state.state === 3
      ? 0
      : item.state.state === 2
        ? 1
        : 2;
  pool = [...pool].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      Date.parse(a.state.due) - Date.parse(b.state.due) ||
      a.noteNo - b.noteNo ||
      a.ord - b.ord,
  );
  const seen = new Set<string>();
  pool = pool.filter((item) =>
    seen.has(item.noteId) ? false : (seen.add(item.noteId), true),
  );
  return {
    learning: pool.filter((i) => i.state.state === 1 || i.state.state === 3),
    reviews: pool.filter((i) => i.state.state === 2),
    fresh: pool.filter((i) => i.state.state === 0),
    sinceNew: 0,
    reviewsPerNew: Math.max(
      1,
      Math.ceil(
        pool.filter((i) => i.state.state === 2).length /
          (pool.filter((i) => i.state.state === 0).length + 1),
      ),
    ),
    lastCheckpoint: null,
    total: pool.length,
    answered: 0,
    settings: { ...settings },
  };
}
export interface QueueNext {
  item: ReviewItem | null;
  queue: ReviewQueue;
  waitUntil: number | null;
}
export function nextCard(input: ReviewQueue, now = Date.now()): QueueNext {
  const queue: ReviewQueue = {
    ...input,
    learning: [...input.learning],
    reviews: [...input.reviews],
    fresh: [...input.fresh],
  };
  const take = (
    list: ReviewItem[],
    eligible: (item: ReviewItem) => boolean = () => true,
  ) => {
    let index = list.findIndex(
      (item) =>
        eligible(item) &&
        (!queue.settings.mixDecks ||
          checkpointKey(item) !== queue.lastCheckpoint),
    );
    if (index < 0) index = list.findIndex(eligible);
    if (index < 0) return null;
    const [item] = list.splice(index, 1);
    queue.lastCheckpoint = checkpointKey(item);
    return item;
  };
  let item = take(queue.learning, (i) => Date.parse(i.state.due) <= now);
  if (item) return { item, queue, waitUntil: null };
  if (queue.reviews.length || queue.fresh.length) {
    const ratio = queue.reviewsPerNew;
    let pickNew =
      !!queue.fresh.length &&
      (!queue.reviews.length || queue.sinceNew >= ratio);
    if (queue.settings.mixDecks && queue.lastCheckpoint) {
      const preferred = pickNew ? queue.fresh : queue.reviews,
        alternate = pickNew ? queue.reviews : queue.fresh;
      if (
        !preferred.some((i) => checkpointKey(i) !== queue.lastCheckpoint) &&
        alternate.some((i) => checkpointKey(i) !== queue.lastCheckpoint)
      )
        pickNew = !pickNew;
    }
    item = take(pickNew ? queue.fresh : queue.reviews);
    queue.sinceNew = pickNew ? 0 : queue.sinceNew + 1;
    return { item, queue, waitUntil: null };
  }
  item = take(
    queue.learning,
    (i) =>
      Date.parse(i.state.due) <=
      now + queue.settings.learnAheadMinutes * 60_000,
  );
  return {
    item,
    queue,
    waitUntil:
      item || !queue.learning.length
        ? null
        : Math.min(...queue.learning.map((i) => Date.parse(i.state.due))),
  };
}
/** After a successful durable answer, requeue this same card if it is still learning today. */
export function advanceQueue(
  queue: ReviewQueue,
  item: ReviewItem,
  next: CardState,
  now = Date.now(),
): ReviewQueue {
  const learning = queue.learning.filter((i) => i.cardId !== item.cardId);
  const { end } = studyDayBounds(
    now,
    queue.settings.timeZone,
    queue.settings.rolloverHour,
  );
  if ((next.state === 1 || next.state === 3) && Date.parse(next.due) < end)
    learning.push({ ...item, state: { ...next } });
  learning.sort((a, b) => Date.parse(a.state.due) - Date.parse(b.state.due));
  return { ...queue, learning, answered: queue.answered + 1 };
}
export const remaining = (queue: ReviewQueue) =>
  queue.learning.length + queue.reviews.length + queue.fresh.length;
