import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  Check,
  PencilLine,
  Sparkles,
  X,
  Plus,
  ArrowRight,
  Link as LinkIcon,
} from "lucide-react";
import {
  useApproveAllCards,
  useApproveProposal,
  useProposals,
  useRejectProposal,
} from "../../data/hooks";
import type { Proposal, PlanChangeOp } from "../../data/types";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { EmptyState } from "../../ui/EmptyState";
import { Glyph } from "../../ui/Glyph";
import { MathText } from "../../ui/MathText";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { Slab } from "../../ui/Slab";
import { useToast } from "../../ui/Toast";

function describe(op: PlanChangeOp) {
  switch (op.op) {
    case "add":
      return `Add ${op.code ?? "checkpoint"} · ${op.title}${op.after ? ` after ${op.after}` : ""}`;
    case "update":
      return `Update ${op.code}${op.title ? ` · ${op.title}` : ""}`;
    case "remove":
      return `Remove ${op.code}`;
    case "move":
      return `Move ${op.code} after ${op.after}`;
    case "prereq_add":
      return `${op.code} needs ${op.prereq}`;
    case "prereq_remove":
      return `${op.code} no longer needs ${op.prereq}`;
  }
}
function PendingCard({
  proposal,
  busy,
  commit,
}: {
  proposal: Proposal;
  busy: boolean;
  commit: (approve: boolean) => void;
}) {
  const reduce = !!useReducedMotion(),
    x = useMotionValue(0),
    rotation = useTransform(x, [-300, 300], [-15, 15]),
    green = useTransform(x, [0, 55], [0, 1]),
    red = useTransform(x, [-55, 0], [1, 0]);
  const [before, setBefore] = useState(false);
  const cardElement = useRef<HTMLDivElement>(null);
  const card = proposal.card,
    edit = proposal.cardEdit;
  const front =
    card?.front ??
    (before ? edit?.current.front : (edit?.front ?? edit?.current.front)) ??
    "";
  const back =
    card?.back ??
    (before ? edit?.current.back : (edit?.back ?? edit?.current.back)) ??
    "";
  return (
    <motion.div
      ref={cardElement}
      drag={busy ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      style={{ x, rotate: reduce ? 0 : rotation, touchAction: "pan-y" }}
      onDragEnd={(_, info) => {
        const width = cardElement.current?.getBoundingClientRect().width ?? 300;
        if (
          Math.abs(info.offset.x) > width * 0.3 ||
          Math.abs(info.velocity.x) > 600
        )
          commit(
            (Math.abs(info.offset.x) > width * 0.3
              ? info.offset.x
              : info.velocity.x) > 0,
          );
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0.15 : 0.55 }}
      aria-label="Proposal card, swipe right to approve or left to reject"
    >
      <Card stack className="min-h-[340px] rounded-slab p-5">
        <div className="flex items-center gap-2 text-label font-medium text-ink-3">
          <Sparkles size={15} className="text-amber" />
          <span>
            {edit ? `Fix for N${edit.note_no}` : (card?.kind ?? "Card")}
          </span>
          <span className="ml-auto">
            {proposal.projectGlyph} {card?.checkpoint}{" "}
            {proposal.sessionNumber ? ` · S${proposal.sessionNumber}` : ""}
          </span>
        </div>
        {edit && (
          <div className="mt-4">
            <Segmented
              label="Card version"
              value={before ? "before" : "after"}
              onChange={(v) => setBefore(v === "before")}
              options={[
                { value: "before", label: "Before" },
                { value: "after", label: "After" },
              ]}
            />
          </div>
        )}
        <div className="mt-6 font-math">
          <MathText
            source={front}
            variant="card"
            cloze={
              card?.type === "cloze" ? { ord: 1, revealed: false } : undefined
            }
          />
        </div>
        <div aria-hidden="true" className="my-5 h-px bg-amber-line" />
        <MathText
          source={back}
          variant="answer"
          cloze={
            card?.type === "cloze" ? { ord: 1, revealed: true } : undefined
          }
        />
        {edit?.comments
          .filter((c) => edit.resolves?.includes(c.no))
          .map((c) => (
            <p key={c.no} className="mt-5 text-label text-ink-3">
              Your note: {c.body}
            </p>
          ))}
        {proposal.reason && (
          <p className="mt-6 flex items-start gap-2 text-label italic text-ink-3">
            <Sparkles size={15} className="text-amber" />
            {proposal.reason}
          </p>
        )}
        <motion.span
          aria-hidden="true"
          style={{ opacity: green }}
          className="absolute right-6 top-16 rounded-ctl border border-easy bg-success-tint p-3 text-easy"
        >
          <Check />
        </motion.span>
        <motion.span
          aria-hidden="true"
          style={{ opacity: red }}
          className="absolute left-6 top-16 rounded-ctl border border-again bg-danger-tint p-3 text-again"
        >
          <X />
        </motion.span>
      </Card>
    </motion.div>
  );
}
export default function Page() {
  const query = useProposals(),
    approve = useApproveProposal(),
    reject = useRejectProposal(),
    approveAll = useApproveAllCards(),
    notify = useToast();
  const [params, setParams] = useSearchParams(),
    tab = params.get("tab") === "plan" ? "plan" : "cards";
  const [confirm, setConfirm] = useState(false),
    [editing, setEditing] = useState(false),
    [front, setFront] = useState(""),
    [back, setBack] = useState(""),
    [slow, setSlow] = useState(false),
    [completed, setCompleted] = useState(0);
  const pending = approve.isPending || reject.isPending || approveAll.isPending;
  useEffect(() => {
    if (!query.isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [query.isLoading]);
  useEffect(() => {
    if (query.isError)
      notify("Couldn't load proposals.", {
        tone: "danger",
        action: { label: "Try again", onClick: () => void query.refetch() },
      });
  }, [query.isError]);
  const proposals = query.data ?? [],
    cards = proposals.filter(
      (p) => p.kind === "card" || p.kind === "card_edit",
    ),
    plans = proposals.filter(
      (p) => p.kind === "plan" || p.kind === "plan_change",
    ),
    active = cards[0];
  const commit = async (
    p: Proposal,
    accept: boolean,
    edit?: { front: string; back: string },
  ) => {
    if (pending) return;
    try {
      if (accept) await approve.mutateAsync({ id: p.id, edit });
      else await reject.mutateAsync(p.id);
      setCompleted((n) => n + 1);
      setEditing(false);
      notify(accept ? "Approved" : "Rejected");
    } catch {
      notify("Couldn't confirm the proposal. Refresh to check whether it was saved.", { tone: "danger",
        action: {label:"Refresh",onClick:()=>{void query.refetch()}} });
    }
  };
  const openEdit = () => {
    if (!active?.card) return;
    setFront(active.card.front);
    setBack(active.card.back);
    setEditing(true);
  };
  return (
    <Screen
      title="Approve"
      back="/"
      actions={
        cards.some((card) => card.kind === "card") ? (
          <button
            type="button"
            className="min-h-11 text-body-l font-semibold text-amber"
            onClick={() => setConfirm(true)}
          >
            Approve all
          </button>
        ) : undefined
      }
    >
      <Segmented
        label="Proposal types"
        value={tab}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("tab", v);
          setParams(next);
        }}
        options={[
          { value: "cards", label: "Cards", count: cards.length },
          { value: "plan", label: "Plan", count: plans.length },
        ]}
      />
      {query.isLoading ? (
        slow ? (
          <div className="flex flex-col gap-4">
            <Skeleton w="100%" h={380} />
            <Skeleton w="70%" h={48} />
          </div>
        ) : null
      ) : query.isError ? (
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Try again
        </Button>
      ) : tab === "cards" ? (
        active ? (
          <>
            <PendingCard
              key={active.id}
              proposal={active}
              busy={pending}
              commit={(accepted) => void commit(active, accepted)}
            />
            <div
              aria-label={`${completed} reviewed, ${cards.length} remaining`}
              className="flex justify-center gap-2"
            >
              {Array.from(
                { length: Math.min(10, completed + cards.length) },
                (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full ${i < completed ? "w-1.5 bg-amber" : i === completed ? "w-[18px] bg-ink" : "w-1.5 bg-fill-2"}`}
                  />
                ),
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                aria-label="Reject card"
                disabled={pending}
                onClick={() => void commit(active, false)}
                className="flex min-h-12 items-center justify-center gap-1 rounded-ctl border border-again bg-danger-tint px-2 text-again disabled:opacity-50"
              >
                <X size={18} /><span className="text-label">Reject</span>
              </button>
              <button
                type="button"
                aria-label="Edit card"
                disabled={pending || !active.card}
                onClick={openEdit}
                className="flex min-h-12 items-center justify-center gap-1 rounded-ctl border border-edge bg-fill-1 px-2 text-ink-2 disabled:opacity-40"
              >
                <PencilLine size={17} /><span className="text-label">Edit</span>
              </button>
              <button type="button" aria-label="Approve card" disabled={pending}
                onClick={() => void commit(active, true)}
                className="flex min-h-12 items-center justify-center gap-1 rounded-ctl bg-amber px-2 text-amber-ink disabled:opacity-50">
                <Check size={18}/><span className="text-label font-semibold">Approve</span>
              </button>
            </div>
          </>
        ) : (
          <EmptyState
            art="inbox"
            title="All clear"
            body="New cards join your next review."
          />
        )
      ) : plans.length ? (
        <div className="flex flex-col gap-4">
          {plans.map((p) => (
            <Slab key={p.id} className="p-5">
              <div className="flex items-center gap-3">
                <Glyph subject={p.projectGlyph} size={40} />
                <div>
                  <h2 className="font-semibold">
                    {p.projectSlug.replaceAll("-", " ")}
                  </h2>
                  <p className="text-label text-ink-3">
                    {p.sessionNumber ? `From S${p.sessionNumber}` : "New plan"}
                  </p>
                </div>
              </div>
              <div role="region" aria-label="Plan errata" className="my-5 flex flex-col">
                {p.planChange?.ops.map((op, i) => (
                  <div
                    key={i}
                    className="flex min-h-11 items-start gap-3 border-b border-edge py-3 text-body text-ink-soft last:border-0"
                  >
                    {op.op === "add" ? (
                      <Plus size={17} className="text-easy" />
                    ) : op.op.startsWith("prereq") ? (
                      <LinkIcon size={17} className="text-amber" />
                    ) : (
                      <ArrowRight size={17} className="text-ink-3" />
                    )}
                    <span className="min-w-0 flex-1">{describe(op)}</span>
                  </div>
                ))}
                {p.plan && (
                  <p className="text-ink-soft">
                    {p.plan.checkpoints.length} checkpoints proposed
                  </p>
                )}
              </div>
              {p.reason && (
                <p className="mb-4 flex gap-2 text-label italic text-ink-3">
                  <Sparkles size={15} />
                  {p.reason}
                </p>
              )}
              <Link
                to={`/proposals/${p.id}`}
                className="inline-flex min-h-11 items-center text-body font-semibold text-amber"
              >
                See the whole plan
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void commit(p, false)}
                >
                  Reject
                </Button>
                <Button disabled={pending} onClick={() => void commit(p, true)}>
                  Approve
                </Button>
              </div>
            </Slab>
          ))}
        </div>
      ) : (
        <EmptyState
          art="inbox"
          title="All clear"
          body="New plans and changes will appear here."
        />
      )}
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Approve ${cards.filter((p) => p.kind === "card").length} cards?`}
      >
        <p className="mb-5 text-ink-2">
          These cards will join your review queue.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={async () => {
              try {
                const n = await approveAll.mutateAsync();
                setConfirm(false);
                notify(`${n} cards approved`);
              } catch {
                notify("Couldn't confirm approvals. Refresh before retrying.", { tone: "danger",
                  action: {label:"Refresh",onClick:()=>{void query.refetch()}} });
              }
            }}
          >
            Approve
          </Button>
        </div>
      </Sheet>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit card">
        <div className="flex flex-col gap-4">
          <label className="text-ink-2">
            Front
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="mt-2 min-h-24 w-full rounded-ctl border border-edge bg-well p-3 text-ink"
            />
          </label>
          <label className="text-ink-2">
            Back
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="mt-2 min-h-24 w-full rounded-ctl border border-edge bg-well p-3 text-ink"
            />
          </label>
          <p className="text-label text-ink-3">Preview</p>
          <MathText source={front} variant="card" />
          <MathText source={back} variant="answer" />
          <Button
            disabled={pending || !front.trim()}
            onClick={() => active && void commit(active, true, { front, back })}
          >
            Approve
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
