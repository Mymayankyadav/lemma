import {MathPreview} from '../../ui/MathPreview';
import {getApi} from "../../data";
import {useQuery} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
} from "lucide-react";
import {
  useAddComment,
  useCard,
  useDismissComment,
  useProjects,
  useSetNoteStatus,
  useSettings,
  useUpdateNote,
} from "../../data/hooks";
import { DEFAULT_W, retrievability } from "../../lib/fsrs";
import { Editor, type EditorValue } from "../cards/Editor";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { IconButton } from "../../ui/IconButton";
import { MathText } from "../../ui/MathText";
import { Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { Slab } from "../../ui/Slab";
import { Sparkline } from "../../ui/charts/Sparkline";
import { useToast } from "../../ui/Toast";
function next(due: string | null) {
  if (!due) return "New";
  const days = Math.ceil((Date.parse(due) - Date.now()) / 86400000);
  return days <= 0 ? "Due now" : days === 1 ? "1 day" : `${days} days`;
}
function age(at: string) {
  const days = Math.floor((Date.now() - Date.parse(at)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
export default function Page() {
  const { no = "0" } = useParams(),
    number = Number(no),
    query = useCard(number),
    projects = useProjects(),
    settings = useSettings(),
    add = useAddComment(),
    dismiss = useDismissComment(),
    update = useUpdateNote(),
    status = useSetNoteStatus(),
    notify = useToast(),
    navigate = useNavigate();
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [message, setMessage] = useState(""),
    [commentCursors,setCommentCursors] = useState<string[]>([]),
    [reviewCursors,setReviewCursors] = useState<string[]>([]),
    [slow, setSlow] = useState(false),
    [actionMenu, setActionMenu] = useState(false);
  const actionRoot = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const closeEditing = useCallback(() => setEditing(false), []);
  const closeDeleting = useCallback(() => setDeleting(false), []);
  useEffect(() => {
    if (!query.isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [query.isLoading]);
  useEffect(() => {
    if (!actionMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!actionRoot.current?.contains(event.target as Node)) setActionMenu(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    actionMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [actionMenu]);
  const actionKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setActionMenu(false);
      actionRoot.current?.querySelector<HTMLButtonElement>('[aria-label="Card actions"]')?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = Array.from(actionMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };
  const detail = query.data,
    note = detail?.note,
    project = projects.data?.find((p) => p.slug === note?.projectSlug),
    card = detail?.cards[0]?.state;
  // Only the selected cursor page is observed. React Query owns the 30-second
  // cache, so returning to an already visited page never downloads it again.
  const reviewCursor = reviewCursors.at(-1) ?? null;
  const commentCursor = commentCursors.at(-1) ?? null;
  const reviewQuery = useQuery({
    queryKey: ['card-history-page', number, reviewCursor],
    queryFn: () => getApi().getCardHistoryPage(number, reviewCursor!),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: reviewCursor !== null,
  });
  const commentQuery = useQuery({
    queryKey: ['card-comments-page', number, commentCursor],
    queryFn: () => getApi().getCardCommentsPage(number, commentCursor!),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: commentCursor !== null,
  });
  const reviewPage = reviewCursor === null ? null : reviewQuery.data;
  const commentPage = commentCursor === null ? null : commentQuery.data;
  const pageBusy = reviewQuery.isFetching || commentQuery.isFetching;
  const rawComments = commentCursor === null
    ? detail?.comments ?? [] : commentPage?.rows ?? [];
  const visibleComments = rawComments.filter(c => c.status === 'open' || c.status === 'addressed');
  const visibleReviews = reviewCursor === null
    ? detail?.history ?? [] : reviewPage?.rows ?? [];
  // The initial 21-row probe supplies the first continuation without a second request.
  const moreComments = Boolean(commentCursor === null
    ? detail?.commentsNextCursor : commentPage?.nextCursor);
  const moreReviews = Boolean(reviewCursor === null
    ? detail?.historyNextCursor : reviewPage?.nextCursor);
  useEffect(() => {
    setCommentCursors([]);
    setReviewCursors([]);
    // The route component is reused for /cards/:no. A Delete confirmation,
    // Edit sheet or overflow menu from the previous card must never remain
    // actionable against a newly selected card.
    setActionMenu(false);
    setDeleting(false);
    setEditing(false);
    setMessage("");
  }, [number]);
  useEffect(() => {
    if (reviewQuery.isError) notify("Couldn't load older reviews.", {tone: "danger"});
  }, [reviewQuery.errorUpdatedAt, reviewQuery.isError, notify]);
  useEffect(() => {
    if (commentQuery.isError) notify("Couldn't load older comments.", {tone: "danger"});
  }, [commentQuery.errorUpdatedAt, commentQuery.isError, notify]);
  const olderReviews = () => {
    if (pageBusy) return;
    const cursor = reviewCursor === null
      ? detail?.historyNextCursor : reviewPage?.nextCursor;
    if (cursor) setReviewCursors(v => [...v, cursor]);
  };
  const newerReviews = () => {
    if (pageBusy) return;
    setReviewCursors(v => v.slice(0, -1));
  };
  const olderComments = () => {
    if (pageBusy) return;
    const cursor = commentCursor === null
      ? detail?.commentsNextCursor : commentPage?.nextCursor;
    if (cursor) setCommentCursors(v => [...v, cursor]);
  };
  const newerComments = () => {
    if (pageBusy) return;
    setCommentCursors(v => v.slice(0, -1));
  };
  const chart = useMemo(() => {
    const history = [...(detail?.history ?? [])].sort(
      (a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt),
    );
    return history.slice(1).map((r, i) => ({
      value: Math.max(
        0,
        (Date.parse(r.reviewedAt) - Date.parse(history[i].reviewedAt)) /
          86400000,
      ),
      rating: r.rating,
    }));
  }, [detail?.history]);
  const recall =
    card?.lastReview && card.stability > 0
      ? retrievability(
          settings.data?.fsrsWeights ?? DEFAULT_W,
          Math.max(0, (Date.now() - Date.parse(card.lastReview)) / 86400000),
          card.stability,
        )
      : null;
  const save = async (v: EditorValue) => {
    if (!note) return;
    try {
      await update.mutateAsync({
        noteNo: note.noteNo,
        patch: {
          front: v.front,
          back: v.back,
          type: v.type,
          kind: v.kind,
          tags: v.tags,
        },
      });
      setEditing(false);
      notify("Card updated");
    } catch {
      notify("Couldn't save the card.", { tone: "danger" });
    }
  };
  const setStatus = async (nextStatus: "active" | "suspended" | "deleted") => {
    if (!note) return;
    try {
      await status.mutateAsync({ noteNo: note.noteNo, status: nextStatus });
      setDeleting(false);
      notify(
        nextStatus === "deleted"
          ? "Card deleted"
          : nextStatus === "suspended"
            ? "Card paused"
            : "Card resumed",
      );
      if (nextStatus === "deleted") void navigate("/cards");
    } catch {
      notify("Couldn't update the card.", { tone: "danger" });
    }
  };
  const submit = async () => {
    if (!note || !message.trim() || add.isPending) return;
    try {
      await add.mutateAsync({ noteNo: note.noteNo, body: message.trim() });
      setMessage("");
      notify("Saved for your tutor");
    } catch {
      notify("Couldn't save your note.", { tone: "danger" });
    }
  };
  const remove = async (no: number) => {
    try {
      await dismiss.mutateAsync(no);
      notify("Note dismissed");
    } catch {
      notify("Couldn't dismiss your note.", { tone: "danger" });
    }
  };
  return (
    <Screen
      className="[&_header_h1]:whitespace-nowrap [&_header_h1]:text-card"
      title="Card detail"
      back="/cards"
      actions={
        note ? (
          <>
            <IconButton
              icon={PencilLine}
              label="Edit card"
              tone="plain"
              onClick={() => setEditing(true)}
            />
            <div ref={actionRoot} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setActionMenu(false); }}>
              <IconButton
                icon={MoreHorizontal}
                label="Card actions"
                tone="plain"
                aria-haspopup="menu"
                aria-expanded={actionMenu}
                onClick={() => setActionMenu(open => !open)}
              />
              {actionMenu && (
                <div
                  ref={actionMenuRef}
                  role="menu"
                  aria-label="Card actions"
                  onKeyDown={actionKeys}
                  className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-ctl border border-edge bg-[var(--card)] p-1 shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={status.isPending}
                    className="flex min-h-11 w-full items-center rounded-ctl px-3 text-left text-label font-medium text-ink-2 hover:bg-fill-1 disabled:opacity-50"
                    onClick={() => {
                      setActionMenu(false);
                      actionRoot.current?.querySelector<HTMLButtonElement>('[aria-label="Card actions"]')?.focus();
                      void setStatus(note.status === "suspended" ? "active" : "suspended");
                    }}
                  >
                    {note.status === "suspended" ? "Resume card" : "Suspend card"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex min-h-11 w-full items-center rounded-ctl px-3 text-left text-label font-medium text-again hover:bg-fill-1"
                    onClick={() => {
                      setActionMenu(false);
                      setDeleting(true);
                    }}
                  >
                    Delete card
                  </button>
                </div>
              )}
            </div>
          </>
        ) : undefined
      }
    >
      {query.isLoading ? (
        slow ? (
          <>
            <Skeleton w="60%" h={20} />
            <Skeleton w="100%" h={240} />
            <Skeleton w="100%" h={150} />
          </>
        ) : null
      ) : query.isError || !note ? (
        <div>
          <p className="text-ink-2">This card could not be loaded.</p>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <p className="text-label text-ink-3">
            <span data-card-subject-glyph aria-hidden="true" className="mr-1 font-math text-card italic text-ink-2">{project?.subject.glyph ?? "∫"}</span> {project?.title ?? note.projectSlug}{" "}
            {note.checkpointCode && `· ${note.checkpointCode}`} · N{note.noteNo}
          </p>
          <Slab as="article" className="p-5" aria-label="Card front and answer">
            <MathText
              source={note.front}
              variant="card"
              interactiveMath
              cloze={
                note.type === "cloze"
                  ? { ord: detail.cards[0]?.ord ?? 1, revealed: false }
                  : undefined
              }
            />
            <div data-card-answer-divider className="my-6 h-px bg-[var(--hair)]" aria-hidden="true" />
            <MathText
              source={note.type === "cloze" ? note.front : note.back}
              variant="answer"
              interactiveMath
              cloze={
                note.type === "cloze"
                  ? { ord: detail.cards[0]?.ord ?? 1, revealed: true }
                  : undefined
              }
            />
            <div className="mt-5 flex flex-wrap gap-2">
              {note.sourceShort && (
                <Chip icon={BookOpen}>
                  {note.sourceShort}
                  {note.pageLabel ? ` p. ${note.pageLabel}` : ""}
                </Chip>
              )}
              {note.sessionNumber && (
                <Link to={`/s/${note.projectSlug}/${note.sessionNumber}`} className="inline-flex min-h-11 items-center">
                  <Chip icon={MessageCircle}>S{note.sessionNumber}</Chip>
                </Link>
              )}
              <Chip>{note.kind}</Chip>
              {note.status === "suspended" && <Chip tone="amber">Paused</Chip>}
            </div>
          </Slab>
          <Slab className="p-5">
            <h2 className="mb-4 text-headline font-medium" style={{fontFamily:"var(--font-display)"}}>Memory</h2>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-label text-ink-3">Next</p>
                <p className="mt-1 font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{next(card?.due ?? null)}</p>
              </div>
              <div>
                <p className="text-label text-ink-3">Stability</p>
                <p className="mt-1 font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>
                  {card && card.stability > 0
                    ? `${Math.round(card.stability)} d`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-label text-ink-3">Recall now</p>
                <p data-recall-value className="mt-1 font-medium tabular-nums text-ink" style={{fontFamily:"var(--font-num)"}}>
                  {recall === null ? "—" : `${Math.round(recall * 100)}%`}
                </p>
              </div>
            </div>
            {chart.length > 0 && (
              <div className="mt-5">
                <Sparkline
                  data={chart}
                  width={342}
                  height={64}
                  title="Intervals between reviews"
                />
              </div>
            )}
          </Slab>
          <section>
            <h2 className="mb-4 text-headline font-medium" style={{fontFamily:"var(--font-display)"}}>For your tutor</h2>
            <div className="flex flex-col gap-3">
              {visibleComments
                .filter((c) => c.status === "open")
                .map((c) => (
                  <div
                    key={c.no}
                    data-comment-row
                    className="border-l-2 border-amber py-2 pl-4 pr-2"
                  >
                    <p className="font-math text-body-l italic">{c.body}</p>
                    <p className="mt-3 text-label text-ink-3">
                      <span className="mr-2 inline-block size-1.5 rounded-full bg-amber" />
                      Next time you ask to update cards · {age(c.createdAt)}
                    </p>
                    <button
                      className="mt-2 min-h-11 text-label font-semibold text-amber"
                      disabled={dismiss.isPending}
                      onClick={() => void remove(c.no)}
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              {visibleComments
                .filter((c) => c.status === "addressed")
                .map((c) => (
                  <details key={c.no} data-comment-row className="rounded-ctl bg-fill-1 p-4">
                    <summary className="flex cursor-pointer items-center gap-2 text-label text-ink-2">
                      <Check size={15} className="text-easy" />
                      Addressed
                      {c.resolvedByOrigin ? ` by ${c.resolvedByOrigin}` : ""}
                    </summary>
                    <p className="mt-3 text-ink-3">{c.body}</p>
                  </details>
                ))}
              {!visibleComments.length && (
                <p className="text-body text-ink-3" role={commentCursor !== null && commentQuery.isPending ? "status" : undefined}>
                  {commentCursor !== null && commentQuery.isPending
                    ? "Loading comments…" : "No active notes on this page."}
                </p>
              )}
              {commentCursor !== null && commentQuery.isError && (
                <button type="button" className="min-h-11 text-label font-semibold text-amber"
                  onClick={() => void commentQuery.refetch()}>Try loading comments again</button>
              )}
              <div className="flex flex-wrap gap-3">
               {commentCursors.length>0&&<button type="button" className="min-h-11 text-label font-semibold text-amber" disabled={pageBusy} onClick={()=>void newerComments()}>Newer comments</button>}
               {moreComments&&<button type="button" className="min-h-11 text-label font-semibold text-amber" disabled={pageBusy} onClick={()=>void olderComments()}>More comments</button>}
              </div>
            </div>
          </section>
          <section aria-label="Review history">
           <h2 className="mb-3 text-headline font-medium">Recent reviews</h2>
           {visibleReviews.map((r,i)=><div key={r.reviewedAt+':'+i} data-review-row className="flex min-h-11 items-center justify-between gap-3 border-b border-edge py-2 text-body">
            <span className="text-ink-2">{new Date(r.reviewedAt).toLocaleDateString()}</span>
            <span className="text-amber">{['','Again','Hard','Good','Easy'][r.rating]??'Reviewed'}</span>
            <span className="text-ink-3">{r.confidence??'—'}</span>
           </div>)}
           {!visibleReviews.length&&<p className="text-label text-ink-3"
            role={reviewCursor !== null && reviewQuery.isPending ? "status" : undefined}>
            {reviewCursor !== null && reviewQuery.isPending ? "Loading reviews…" : "No reviews yet."}
           </p>}
           {reviewCursor !== null && reviewQuery.isError && (
            <button type="button" className="min-h-11 text-label font-semibold text-amber"
             onClick={() => void reviewQuery.refetch()}>Try loading reviews again</button>
           )}
           <div className="flex flex-wrap gap-3">
            {reviewCursors.length>0&&<button type="button" className="min-h-11 text-label font-semibold text-amber" disabled={pageBusy} onClick={()=>void newerReviews()}>Newer reviews</button>}
            {moreReviews&&<button type="button" className="min-h-11 text-label font-semibold text-amber" disabled={pageBusy} onClick={()=>void olderReviews()}>More reviews</button>}
           </div>
          </section>
          <form
            className="flex gap-2 rounded-ctl border border-edge bg-well p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="sr-only" htmlFor="tutor-note">
              Note for your tutor
            </label>
            <input
              id="tutor-note"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              placeholder="Note for your tutor"
              className="min-w-0 flex-1 bg-transparent px-2 text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="submit"
              aria-label="Save note for your tutor"
              disabled={!message.trim() || add.isPending}
              className="flex size-11 items-center justify-center rounded-ctl bg-amber text-amber-ink disabled:opacity-40"
            >
              <ArrowRight size={20} />
            </button>
          </form>
          <MathPreview source={message}/>
          <Sheet
            open={editing}
            onClose={closeEditing}
            title="Edit card"
          >
            <Editor
              initial={note}
              busy={update.isPending}
              onSubmit={(v) => void save(v)}
            />
          </Sheet>
          <Sheet
            open={deleting}
            onClose={closeDeleting}
            title="Delete this card?"
          >
            <p className="mb-5 text-ink-2">
              This removes the card from your library and review queue.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={status.isPending}
                onClick={() => void setStatus("deleted")}
              >
                Delete card
              </Button>
            </div>
          </Sheet>
        </>
      )}
    </Screen>
  );
}
