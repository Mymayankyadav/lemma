import {MathPreview} from '../../ui/MathPreview';
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Bot,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Target,
  Waypoints,
} from "lucide-react";
import {
  useApproveProposal,
  useProposal,
  useProject,
  useRejectProposal,
  useSettings,
} from "../../data/hooks";
import {planReviewNodes} from "./nodes";
import {planIdeasGraph} from "./ideas";
import {layoutPlanMap, R} from "./planMap";
import {buildAtlasTree} from "../atlas/tree";
import {IdeaGraph} from "../atlas/IdeaGraph";
import type {ReviewNode} from "./nodes";
import { chatLink, revisePlanPrompt } from "../../lib/chat";
import { Button } from "../../ui/Button";
import { Glyph } from "../../ui/Glyph";
import { MathText } from "../../ui/MathText";
import { Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { Slab } from "../../ui/Slab";
import { useToast } from "../../ui/Toast";
import { Tex } from "../../ui/Tex";
import { plainMath } from "../../lib/plain-math";

type Node = ReviewNode;
/** Checkpoints as a tree spanning out left to right; every prerequisite drawn as a dashed line. */
function PlanMap({
  nodes,
  selected,
  onSelect,
}: {
  nodes: Node[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const layout = useMemo(() => layoutPlanMap(nodes), [nodes]);
  const at = useMemo(() => new Map(layout.nodes.map((n) => [n.code, n])), [layout]);
  const byCode = useMemo(() => new Map(nodes.map((n) => [n.code, n])), [nodes]);
  return (
    <div className="overflow-x-auto rounded-slab border border-edge bg-well" aria-label="Checkpoint prerequisites">
      <svg role="img" aria-label="Map of proposed checkpoints and prerequisites" width={layout.width} height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: "none" }} className="block">
        {layout.edges.map((e) => {
          const a = at.get(e.from)!, b = at.get(e.to)!;
          return <line key={e.from + ">" + e.to} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--amber-line-2)" strokeWidth="1.5" strokeDasharray="3 4" />;
        })}
        {layout.nodes.map((pos) => {
          const n = byCode.get(pos.code)!, on = selected === n.code;
          return (
            <g key={n.code} role="button" tabIndex={0} aria-label={`Select ${n.code} ${n.title}`} style={{ cursor: "pointer" }}
              onClick={() => onSelect(n.code)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.code); } }}>
              <circle cx={pos.x} cy={pos.y} r={R + 5} fill="transparent" />
              <circle cx={pos.x} cy={pos.y} r={R} fill={on ? "var(--amber)" : "var(--raised)"}
                stroke={n.change ? "var(--amber)" : "var(--amber-line-2)"} strokeWidth={n.change ? 2 : 1}
                strokeDasharray={n.change === "added" ? "4 3" : undefined} />
              <text x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize={n.code.length > 4 ? 8 : 9} fontWeight="600"
                fill={on ? "var(--amber-ink)" : "var(--ink)"}>{n.code}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function dueLabel(date?: string | null) {
  if (!date) return null;
  const d = new Date(date + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
/** Everything one checkpoint covers, one tap from the map or the list; steps through the plan in order. */
function CheckpointDrawer({
  nodes,
  code,
  projectSlug,
  isChange,
  onOpen,
  onClose,
}: {
  nodes: Node[];
  code: string;
  projectSlug: string;
  isChange: boolean;
  onOpen: (code: string) => void;
  onClose: () => void;
}) {
  const index = nodes.findIndex((n) => n.code === code),
    node = nodes[index];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < nodes.length - 1) onOpen(nodes[index + 1].code);
      if (e.key === "ArrowLeft" && index > 0) onOpen(nodes[index - 1].code);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [index, nodes, onOpen]);
  if (!node) return null;
  const neededFor = nodes.filter((n) => n.prereqs.includes(node.code));
  const reading = node.sources?.length
    ? node.sources.map((s) => s.source + (s.pages ? " pp. " + s.pages : "")).join("; ")
    : node.source || node.pages
      ? `${node.source ?? "Book"}${node.pages ? ` pp. ${node.pages}` : ""}`
      : null;
  const jump = (target: string) =>
    nodes.some((n) => n.code === target) ? (
      <button key={target} type="button" onClick={() => onOpen(target)}
        className="min-h-11 min-w-11 rounded-s border border-amber-line px-2 text-label font-semibold text-amber">
        {target}
      </button>
    ) : (
      <span key={target} className="rounded-s border border-edge px-2 py-1 text-label text-ink-3">{target}</span>
    );
  return (
    <Sheet open onClose={onClose} title={`${node.code} · ${plainMath(node.title)}`}>
      <div data-checkpoint-drawer={node.code} className="flex flex-col gap-4 text-body text-ink-2">
        <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-3">
          {node.stage && <span>{node.stage}</span>}
          {dueLabel(node.dueOn) && (
            <span className="flex items-center gap-1"><CalendarDays size={14} />Planned {dueLabel(node.dueOn)}</span>
          )}
          {node.change && (
            <span className="rounded-s border border-amber-line px-1.5 text-caption text-amber">
              {node.change === "added" ? "New in this change" : "Changed"}
            </span>
          )}
        </div>
        {node.objective && <MathText source={node.objective} className="text-ink" />}
        {node.criterion && (
          <div className="flex gap-2 rounded-ctl border border-edge bg-well p-3">
            <Target size={17} className="mt-1 shrink-0 text-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold text-ink-3">Done when</p>
              <MathText source={node.criterion} className="font-math" />
            </div>
          </div>
        )}
        {node.steps.length > 0 && (
          <div>
            <p className="mb-1 text-caption font-semibold text-ink-3">{node.steps.length} steps</p>
            <ol className="flex flex-col">
              {node.steps.map((step, i) => (
                <li key={i} className="flex min-h-9 items-baseline gap-3 border-b border-edge py-1.5 last:border-0">
                  <span className="w-5 shrink-0 text-right text-label tabular-nums text-amber">{i + 1}</span>
                  <Tex source={step} className="min-w-0 flex-1" />
                </li>
              ))}
            </ol>
          </div>
        )}
        {reading && (
          <p className="flex items-start gap-2"><BookOpen size={16} className="mt-1 shrink-0" />{reading}</p>
        )}
        {(node.prereqs.length > 0 || neededFor.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-caption font-semibold text-ink-3">Builds on</p>
              <div className="flex flex-wrap gap-1.5">{node.prereqs.length ? node.prereqs.map(jump) : <span className="text-label text-ink-3">Nothing</span>}</div>
            </div>
            <div>
              <p className="mb-1 text-caption font-semibold text-ink-3">Needed for</p>
              <div className="flex flex-wrap gap-1.5">{neededFor.length ? neededFor.map((n) => jump(n.code)) : <span className="text-label text-ink-3">Nothing</span>}</div>
            </div>
          </div>
        )}
        {node.concepts && node.concepts.length > 0 && (
          <div>
            <p className="mb-1 text-caption font-semibold text-ink-3">Ideas</p>
            <div className="flex flex-wrap gap-1.5">
              {node.concepts.map((c) => (
                <span key={c} className="rounded-chip border border-edge px-2 py-1 text-label"><Tex source={c} /></span>
              ))}
            </div>
          </div>
        )}
        {isChange && !node.change && (
          <Link to={`/p/${projectSlug}/cp/${node.code}`}
            className="flex min-h-11 items-center justify-between rounded-ctl border border-edge px-3 text-label text-ink-2">
            Unchanged by this proposal. Open {node.code} in the project<ChevronRight size={16} />
          </Link>
        )}
        {node.recheck && (
          <p className="flex items-start gap-2 text-label italic text-ink-3"><RotateCcw size={14} className="mt-0.5 shrink-0" /><Tex source={node.recheck} /></p>
        )}
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button type="button" disabled={index === 0} onClick={() => onOpen(nodes[index - 1].code)}
            className="flex min-h-11 items-center gap-1 rounded-btn border border-edge-2 px-3 text-label disabled:opacity-35">
            <ChevronLeft size={16} />{index > 0 ? nodes[index - 1].code : "Start"}
          </button>
          <span className="text-caption tabular-nums text-ink-3">{index + 1} of {nodes.length}</span>
          <button type="button" disabled={index === nodes.length - 1} onClick={() => onOpen(nodes[index + 1].code)}
            className="flex min-h-11 items-center justify-end gap-1 rounded-btn border border-edge-2 px-3 text-label disabled:opacity-35">
            {index < nodes.length - 1 ? nodes[index + 1].code : "End"}<ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
export default function Page() {
  const { id = "" } = useParams(),
    navigate = useNavigate(),
    query = useProposal(id),
    project = useProject(query.data?.projectSlug ?? ""),
    settings = useSettings(),
    approve = useApproveProposal(),
    reject = useRejectProposal(),
    notify = useToast();
  const [selected, setSelected] = useState(""),
    [drawer, setDrawer] = useState<string | null>(null),
    [asking, setAsking] = useState(false),
    [request, setRequest] = useState(""),
    [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!query.isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [query.isLoading]);
  const p = query.data;
  const nodes = useMemo(
    () => planReviewNodes(p?.plan ?? null, p?.planChange ?? null, project.data?.checkpoints ?? []),
    [p, project.data?.checkpoints],
  );
  const current = nodes.find((n) => n.code === selected) ?? nodes[0];
  const openCheckpoint = (code: string) => { setSelected(code); setDrawer(code); };
  const ideaTree = useMemo(() => {
    if (!p) return null;
    const graph = planIdeasGraph(p.plan, p.planChange, nodes, p.projectSlug,
      {name: project.data?.subject?.name ?? "This plan", glyph: p.projectGlyph});
    return graph ? buildAtlasTree(graph) : null;
  }, [p, nodes, project.data?.subject?.name]);
  const ideaCount = ideaTree ? [...ideaTree.nodes.values()].filter((n) => !n.synthetic).length : 0;
  const stages = useMemo(() => {
    const groups: { name: string; nodes: Node[] }[] = [];
    for (const n of nodes) {
      const name = n.stage?.trim() || "Checkpoints";
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.nodes.push(n);
      else groups.push({ name, nodes: [n] });
    }
    return groups;
  }, [nodes]);
  const pending = approve.isPending || reject.isPending;
  const doApprove = async () => {
    if (!p) return;
    try {
      await approve.mutateAsync({ id: p.id });
      notify("Plan approved");
      void navigate(`/p/${p.projectSlug}`);
    } catch {
      notify("Couldn't approve the plan.", { tone: "danger" });
    }
  };
  const askChanges = async () => {
    if (!p || !request.trim() || pending) return;
    const prompt = revisePlanPrompt(
      p.projectSlug.replaceAll("-", " "),
      request.trim(),
    );
    // A new window must be opened synchronously on a click to avoid popup
    // blocking. Do not reject the pending plan unless the handoff is viable.
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    let copied = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      // The pre-opened chat window can still carry the exact prompt.
    }
    if (!target && !copied) {
      notify("Could not copy or open your tutor. Your proposal is still pending.", { tone: "danger" });
      return;
    }
    try {
      await reject.mutateAsync(p.id);
      if (target) {
        target.location.href = chatLink(settings.data?.preferredChat ?? "claude", prompt);
      } else {
        notify("Request copied. Paste it into your tutor.");
      }
      if (copied && target) notify("Request copied for your tutor");
      setAsking(false);
      void navigate("/proposals?tab=plan");
    } catch {
      target?.close();
      notify("Couldn't request changes. The proposal remains available.", { tone: "danger" });
    }
  };
  return (
    <Screen title="Plan proposal" back="/proposals?tab=plan">
      {query.isLoading ? (
        slow ? (
          <>
            <Skeleton w="70%" h={24} />
            <Skeleton w="100%" h={160} />
          </>
        ) : null
      ) : query.isError || !p ? (
        <div>
          <p className="text-ink-2">This proposal could not be loaded.</p>
          <Button
            className="mt-4"
            variant="ghost"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-title-s font-medium italic" style={{fontFamily:"var(--font-display)"}}>
              {p.kind === "plan" ? "New plan" : "Plan change"}
            </h2>
            <div className="mt-3 flex items-center gap-3 text-label text-ink-3">
              {p.origin === "chatgpt" ? (
                <Bot size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{p.origin === "chatgpt" ? "ChatGPT" : "Claude"}</span>
              <Glyph subject={p.projectGlyph} size={32} />
              <span className="capitalize">
                {p.projectSlug.replaceAll("-", " ")}
              </span>
              <span>
                · {nodes.length}{" "}
                {nodes.length === 1 ? "checkpoint" : "checkpoints"}
              </span>
            </div>
          </div>
          {nodes.length > 0 && (
            <PlanMap
              nodes={nodes}
              selected={drawer ?? ""}
              onSelect={openCheckpoint}
            />
          )}
          <section aria-label="Checkpoints" className="flex flex-col gap-4">
            {stages.map((stage, i) => (
              <div key={stage.name + i}>
                <h3 className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-title-s italic" style={{ fontFamily: "var(--font-display)" }}>{stage.name}</span>
                  <span className="text-caption text-ink-3">{stage.nodes.length}</span>
                </h3>
                <Slab className="rounded-slab px-2 py-1">
                  {stage.nodes.map((node) => (
                    <button
                      key={node.code}
                      type="button"
                      onClick={() => openCheckpoint(node.code)}
                      aria-haspopup="dialog"
                      aria-label={`Open ${node.code} ${plainMath(node.title)}`}
                      className={"flex min-h-12 w-full items-center gap-3 border-b border-edge px-2 text-left last:border-0 " + (current?.code === node.code && drawer ? "bg-amber-tint" : "")}
                    >
                      <span className={"w-[46px] shrink-0 rounded-s border py-0.5 text-center text-label font-semibold text-amber " + (node.change === "added" ? "border-dashed border-amber" : "border-amber-line")}>
                        {node.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate leading-snug"><Tex source={node.title} /></span>
                      {dueLabel(node.dueOn) && <span className="shrink-0 text-caption tabular-nums text-ink-3">{dueLabel(node.dueOn)}</span>}
                      <ChevronRight size={16} className="shrink-0 text-ink-3" />
                    </button>
                  ))}
                </Slab>
              </div>
            ))}
          </section>
          {p.planChange && (
            <section aria-label="Plan errata" className="flex flex-col text-body text-ink-2">
              <h3 className="mb-2 text-title-s italic" style={{fontFamily:"var(--font-display)"}}>Proposed amendments</h3>
              {p.planChange.ops.map((op, i) => (
                <div key={i} className="flex min-h-11 items-start gap-3 border-b border-edge py-3 last:border-0">
                  <span className="w-[46px] shrink-0 rounded-s border border-amber-line px-1 py-1 text-center text-label text-amber">
                    {op.op === "add" ? "Add" : op.op === "remove" ? "Cut" : op.op === "move" ? "Move" : op.op === "update" ? "Edit" : "Link"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {op.op === "add" ? `Add ${nodes.find(n => n.title === op.title && n.stage === (op.stage ?? undefined))?.code ?? op.code ?? "new checkpoint"} · ${op.title}`
                      : op.op === "prereq_add" ? `${op.code} needs ${op.prereq}`
                      : op.op === "prereq_remove" ? `${op.code} no longer needs ${op.prereq}`
                      : op.op === "move" ? `Move ${op.code} after ${op.after}`
                      : `${op.op === "remove" ? "Remove" : "Update"} ${op.code}`}
                  </span>
                </div>
              ))}
              {p.reason && <p className="mt-3 text-label italic text-ink-3">{p.reason}</p>}
            </section>
          )}
          {ideaTree ? (
            <section aria-label="Ideas in this plan" className="flex flex-col gap-2">
              <h3 className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-title-s italic" style={{ fontFamily: "var(--font-display)" }}>
                  <Waypoints size={17} className="text-amber" />Ideas in this plan
                </span>
                <span className="text-caption text-ink-3">{ideaCount} {ideaCount === 1 ? "idea" : "ideas"}</span>
              </h3>
              <p className="text-label text-ink-3">Fold clusters to see how they connect; tap an idea to trace what it builds on and opens up.</p>
              <IdeaGraph tree={ideaTree} label="Ideas in this plan" onCheckpoint={openCheckpoint} />
            </section>
          ) : (
            <p className="flex items-center gap-2 text-label text-ink-3">
              <Waypoints size={17} />No new ideas for your Atlas
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setAsking(true)}
            >
              Ask for changes
            </Button>
            <Button disabled={pending} onClick={() => void doApprove()}>
              Approve plan
            </Button>
          </div>
          {drawer && (
            <CheckpointDrawer nodes={nodes} code={drawer} projectSlug={p.projectSlug} isChange={!!p.planChange} onOpen={openCheckpoint} onClose={() => setDrawer(null)} />
          )}
          <Sheet
            open={asking}
            onClose={() => setAsking(false)}
            title="Ask for changes"
          >
            <label className="text-ink-2">
              What should change?
              <textarea
                autoFocus
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="mt-3 min-h-28 w-full rounded-ctl border border-edge bg-well p-3 text-ink"
              />
            </label>
            <MathPreview source={request}/>
            <p className="my-4 text-label text-ink-3">
              This rejects the proposal and opens your tutor with your request.
            </p>
            <Button
              className="w-full"
              disabled={pending || !request.trim()}
              onClick={() => void askChanges()}
            >
              Send
            </Button>
          </Sheet>
        </>
      )}
    </Screen>
  );
}
