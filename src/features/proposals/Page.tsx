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
  useApproveProposal,
  useProposals,
  useRejectProposal,
} from "../../data/hooks";
import type { Proposal, PlanChangeOp } from "../../data/types";
import { Button } from "../../ui/Button";
import {useOnlineStatus,networkWritable} from "../../ui/useOnlineStatus";
import { Card } from "../../ui/Card";
import { EmptyState } from "../../ui/EmptyState";
import { Glyph } from "../../ui/Glyph";
import { MathText } from "../../ui/MathText";
import { Tex } from "../../ui/Tex";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { Slab } from "../../ui/Slab";
import { useToast } from "../../ui/Toast";
import { groupProposals, pageProposals, type ProposalGroup } from "./groups";
import { firstProposalFrontLine } from "./frontPreview";

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
const projectLabel=(slug:string)=>slug.replaceAll('-', ' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase());

/** One readable line, never a vertically clipped half-formula. Long fronts can
 * be revealed horizontally; selecting the row still opens the full card.
 */
function ProposalFrontLine({source}:{source:string}){
 const scroller=useRef<HTMLSpanElement>(null);
 const [moreLeft,setMoreLeft]=useState(false),[moreRight,setMoreRight]=useState(false);
 const firstLine=firstProposalFrontLine(source);
 const measure=()=>{
  const el=scroller.current;
  if(!el)return;
  const overflow=el.scrollWidth>el.clientWidth+1;
  setMoreLeft(overflow&&el.scrollLeft>1);
  setMoreRight(overflow&&el.scrollLeft+el.clientWidth<el.scrollWidth-1);
 };
 useEffect(()=>{
  measure();
  const el=scroller.current;
  if(!el||typeof ResizeObserver==="undefined")return;
  const observer=new ResizeObserver(measure);
  observer.observe(el);
  if(el.firstElementChild)observer.observe(el.firstElementChild);
  return ()=>observer.disconnect();
 },[firstLine]);
 return <span className="relative block min-w-0 flex-1">
  <span ref={scroller} data-proposal-front-scroll="" onScroll={measure}
   className="block w-full overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
   style={moreRight?{maskImage:"linear-gradient(to right, black calc(100% - 24px), transparent)"}:undefined}
   title={moreLeft||moreRight?"Scroll sideways to read the full first line":undefined}>
   <Tex source={firstLine} className="!inline-block !min-w-max !max-w-none !whitespace-nowrap ![overflow-wrap:normal] [&_.katex]:!text-[16px]"/>
  </span>
  {(moreLeft||moreRight)&&<span data-proposal-front-cue="" aria-hidden="true"
   className={"pointer-events-none absolute top-1/2 -translate-y-1/2 text-label text-ink-2 "+(moreRight?"right-0":"left-0")}>
   {moreRight?"›":"‹"}
  </span>}
 </span>;
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
      <Card className="rounded-slab p-5">
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
    notify = useToast();
  const [params, setParams] = useSearchParams(),
    tab = params.get("tab") === "plan" ? "plan" : "cards";
  const [batch, setBatch] = useState<ProposalGroup | null>(null),
    [staged, setStaged] = useState<{ ids: string[]; label: string } | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [cardPage, setCardPage] = useState(0),
    [planPage, setPlanPage] = useState(0),
    [confirm, setConfirm] = useState(false),
    [editing, setEditing] = useState(false),
    [front, setFront] = useState(""),
    [back, setBack] = useState(""),
    [slow, setSlow] = useState(false),
    [completed, setCompleted] = useState(0);
  const online = useOnlineStatus();
  const pending = approve.isPending || reject.isPending || !!staged;
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
    active = cards.find(p=>p.id===selected)??cards[0],
    allCardGroups = groupProposals(cards),
    cardGroups = groupProposals(pageProposals(cards.slice(cardPage*20),20)),
    planGroups = groupProposals(pageProposals(plans.slice(planPage*20),20));
  useEffect(()=>{
    if(!staged)return;
    const timer=window.setTimeout(()=>{
      const ids=staged.ids;
      setStaged(null);
      if(!networkWritable()){notify("Needs a connection");return;}
      void (async()=>{
        let succeeded=0;
        for(const id of ids){
          if(!networkWritable()){notify("Needs a connection");break}
          try{await approve.mutateAsync({id});succeeded++}
          catch{break}
        }
        if(succeeded===ids.length)notify(`${succeeded} cards approved`,{tone:"success"});
        else notify(`${succeeded} approved; ${ids.length-succeeded} not saved. Refresh before retrying.`,{tone:"danger"});
        void query.refetch();
      })();
    },6000);
    return ()=>window.clearTimeout(timer);
  },[staged]);
  const commit = async (
    p: Proposal,
    accept: boolean,
    edit?: { front: string; back: string },
  ) => {
    if (pending) return;
    if(!networkWritable()){notify("Needs a connection");return}
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
    <Screen title="Approve" back="/"    >
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
      {staged&&<div role="status" className="flex min-h-14 items-center gap-2 rounded-ctl border border-amber-line bg-fill-1 px-3 text-label">
       <span className="min-w-0 flex-1">{staged.ids.length} from {staged.label} queued · saving in 6 s</span>
       <button type="button" className="min-h-11 shrink-0 px-3 font-semibold text-amber" onClick={()=>{setStaged(null);notify("Batch approval cancelled")}}>Undo</button>
      </div>}
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
            <section aria-label="Proposal groups" className="flex flex-col gap-3">
             <p className="text-label text-ink-3">{Math.min(cardPage*20+1,cards.length)}–{Math.min((cardPage+1)*20,cards.length)} of {cards.length} card proposals · grouped by session and checkpoint</p>
             {cardGroups.map(group=><Slab key={group.key} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
               <div className="min-w-0"><h2 className="text-body font-semibold">{projectLabel(group.project)}</h2><p className="text-caption text-ink-3">{group.label} · {group.proposals.length} {group.proposals.length === 1 ? "card" : "cards"}</p></div>
               {group.proposals.some(p=>p.kind==="card")&&<button type="button" disabled={pending} className="min-h-11 px-3 text-label font-semibold text-ink-2 underline decoration-current underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-50" onClick={()=>{setBatch(allCardGroups.find(g=>g.key===group.key)??group);setConfirm(true)}}>
                Approve all from {group.label}
               </button>}
              </div>
              <div role="group" aria-label="Cards in this proposal group" className="flex flex-col divide-y divide-[var(--hair)]">{group.proposals.map(p=><button key={p.id} type="button" disabled={pending} aria-pressed={active.id===p.id} onClick={()=>{setSelected(p.id);setEditing(false)}} className={`flex min-h-11 w-full items-center gap-3 px-2 py-2 text-left text-body ${active.id===p.id?"bg-[var(--paper-2)] text-ink":"text-ink-2"}`}><span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">{active.id===p.id&&<Check size={17} />}</span><ProposalFrontLine source={p.card?.front??p.cardEdit?.front??("Fix N"+(p.cardEdit?.note_no??""))}/></button>)}</div>
             </Slab>)}
             <div className="flex gap-2">
              {cardPage>0&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber" onClick={()=>setCardPage(n=>n-1)}>Previous 20</button>}
              {(cardPage+1)*20<cards.length&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber" onClick={()=>setCardPage(n=>n+1)}>More proposals · {cards.length-(cardPage+1)*20} remaining</button>}
             </div>
            </section>
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
                aria-disabled={!online||undefined}
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
              <button type="button" aria-label="Approve card" aria-disabled={!online||undefined} disabled={pending}
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
          {planGroups.map(group=><section key={group.key} className="flex flex-col gap-3"><h2 className="text-label font-semibold text-ink-2">{projectLabel(group.project)} · {group.label} · {group.proposals.length}</h2>{group.proposals.map((p) => (
            <Slab key={p.id} className="p-5">
              <div className="flex items-center gap-3">
                <Glyph subject={p.projectGlyph} size={40} />
                <div>
                  <h2 className="font-semibold">
                    {projectLabel(p.projectSlug)}
                  </h2>
                  <p className="text-label text-ink-3">
                    {p.kind === "plan_change" ? "Plan change" : "New plan"}{p.sessionNumber ? ` · From S${p.sessionNumber}` : ""}
                  </p>
                </div>
              </div>
              <div role="region" aria-label="Plan errata" className="my-5 flex flex-col">
                {p.planChange?.ops.slice(0,3).map((op, i) => (
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
                {(p.planChange?.ops.length??0)>3&&<Link to={`/proposals/${p.id}`} className="min-h-11 py-3 text-label text-amber">See all {p.planChange!.ops.length} changes</Link>}
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
                  needsNetwork
                  disabled={pending}
                  onClick={() => void commit(p, false)}
                >
                  Reject
                </Button>
                <Button needsNetwork disabled={pending} onClick={() => void commit(p, true)}>
                  Approve
                </Button>
              </div>
            </Slab>
          ))}</section>)}
          <div className="flex gap-2">
           {planPage>0&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber" onClick={()=>setPlanPage(n=>n-1)}>Previous 20</button>}
           {(planPage+1)*20<plans.length&&<button type="button" className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber" onClick={()=>setPlanPage(n=>n+1)}>More plan proposals · {plans.length-(planPage+1)*20} remaining</button>}
          </div>
        </div>
      ) : (
        <EmptyState
          art="inbox"
          title="All clear"
          body="New plans and changes will appear here."
        />
      )}
      <Sheet open={confirm} onClose={()=>setConfirm(false)} title={`Approve ${batch?.proposals.filter(p=>p.kind==="card").length??0} from ${batch?.label??"group"}?`}>
        <p className="mb-3 text-ink-2">Preview the cards from this session and checkpoint. A six-second Undo window appears before anything is saved.</p>
        <ul className="mb-4 max-h-56 min-w-0 overflow-y-auto text-ink-2">{batch?.proposals.filter(p=>p.kind==="card").slice(0,10).map(p=><li key={p.id} className="min-w-0 max-w-full overflow-x-auto border-b border-edge py-2"><MathText source={p.card?.front??""} variant="body" className="min-w-0 max-w-full text-base" /></li>)}</ul>
        {(batch?.proposals.filter(p=>p.kind==="card").length??0)>10&&<p className="mb-3 text-label text-ink-3">Showing 10 of {batch?.proposals.filter(p=>p.kind==="card").length} cards in this batch.</p>}
        <div className="grid grid-cols-2 gap-3"><Button variant="ghost" onClick={()=>setConfirm(false)}>Cancel</Button>
         <Button needsNetwork disabled={pending || !batch?.proposals.some(p=>p.kind==="card")} onClick={()=>{
          if(!batch)return;
          setStaged({ids:batch.proposals.filter(p=>p.kind==="card").map(p=>p.id),label:batch.label});
          setBatch(null);setConfirm(false);
         }}>Queue approvals</Button></div>
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
            needsNetwork
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
