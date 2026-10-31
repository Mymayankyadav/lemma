import {MathPreview} from '../../ui/MathPreview';
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  MessageCircle,
  Pause,
  PencilLine,
  Play,
  Trash2,
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
    [allComments,setAllComments] = useState(false),
    [allReviews,setAllReviews] = useState(false),
    [slow, setSlow] = useState(false);
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
  const detail = query.data,
    note = detail?.note,
    project = projects.data?.find((p) => p.slug === note?.projectSlug),
    card = detail?.cards[0]?.state;
  const visibleComments = useMemo(() => [...(detail?.comments??[])]
    .filter(c=>c.status==='open'||c.status==='addressed')
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    .slice(0,allComments?undefined:20),[detail?.comments,allComments]);
  const visibleReviews = useMemo(() => [...(detail?.history??[])]
    .sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt))
    .slice(0,allReviews?undefined:20),[detail?.history,allReviews]);
  const totalComments = detail?.comments.filter(c=>c.status==='open'||c.status==='addressed').length??0;
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
              onClick={() => setEditing(true)}
            />
            <IconButton
              icon={note.status === "suspended" ? Play : Pause}
              label={note.status === "suspended" ? "Resume card" : "Pause card"}
              disabled={status.isPending}
              onClick={() =>
                void setStatus(
                  note.status === "suspended" ? "active" : "suspended",
                )
              }
            />
            <IconButton
              icon={Trash2}
              label="Delete card"
              onClick={() => setDeleting(true)}
            />
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
            <span aria-hidden="true" className="mr-1 font-math text-card italic text-amber">{project?.subject.glyph ?? "∫"}</span> {project?.title ?? note.projectSlug}{" "}
            {note.checkpointCode && `· ${note.checkpointCode}`} · N{note.noteNo}
          </p>
          <Slab as="article" className="p-5" aria-label="Card front and answer">
            <MathText
              source={note.front}
              variant="card"
              cloze={
                note.type === "cloze"
                  ? { ord: detail.cards[0]?.ord ?? 1, revealed: false }
                  : undefined
              }
            />
            <div className="my-6 h-px bg-amber" aria-hidden="true" />
            <MathText
              source={note.type === "cloze" ? note.front : note.back}
              variant="answer"
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
                <p className="mt-1 font-medium tabular-nums text-amber" style={{fontFamily:"var(--font-num)"}}>
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
                  <details key={c.no} className="rounded-ctl bg-fill-1 p-4">
                    <summary className="flex cursor-pointer items-center gap-2 text-label text-ink-2">
                      <Check size={15} className="text-easy" />
                      Addressed
                      {c.resolvedByOrigin ? ` by ${c.resolvedByOrigin}` : ""}
                    </summary>
                    <p className="mt-3 text-ink-3">{c.body}</p>
                  </details>
                ))}
              {!detail.comments.some(
                (c) => c.status === "open" || c.status === "addressed",
              ) && (
                <p className="text-body text-ink-3">
                  No notes for your tutor yet.
                </p>
              )}
              {totalComments>20&&<button type="button" className="min-h-11 text-label font-semibold text-amber" onClick={()=>setAllComments(v=>!v)}>
               {allComments?'Show latest 20':'More comments ('+(totalComments-20)+')'}
              </button>}
            </div>
          </section>
          <section aria-label="Review history">
           <h2 className="mb-3 text-headline font-medium">Recent reviews</h2>
           {visibleReviews.map((r,i)=><div key={r.reviewedAt+':'+i} className="flex min-h-11 items-center justify-between gap-3 border-b border-edge py-2 text-body">
            <span className="text-ink-2">{new Date(r.reviewedAt).toLocaleDateString()}</span>
            <span className="text-amber">{['','Again','Hard','Good','Easy'][r.rating]??'Reviewed'}</span>
            <span className="text-ink-3">{r.confidence??'—'}</span>
           </div>)}
           {!detail.history.length&&<p className="text-label text-ink-3">No reviews yet.</p>}
           {detail.history.length>20&&<button type="button" className="min-h-11 text-label font-semibold text-amber" onClick={()=>setAllReviews(v=>!v)}>
            {allReviews?'Show latest 20':'More reviews ('+(detail.history.length-20)+')'}
           </button>}
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
