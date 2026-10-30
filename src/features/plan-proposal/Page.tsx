import {MathPreview} from '../../ui/MathPreview';
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Bot,
  BookOpen,
  MessageSquare,
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

type Node = ReviewNode;
function PlanMap({
  nodes,
  selected,
  onSelect,
}: {
  nodes: Node[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const layout = useMemo(() => {
    const byCode = new Map(nodes.map((n) => [n.code, n])),
      cache = new Map<string, number>();
    const depth = (code: string, path: Set<string>): number => {
      if (cache.has(code)) return cache.get(code)!;
      if (path.has(code)) return 0;
      const node = byCode.get(code),
        next = new Set(path).add(code),
        parents = node?.prereqs.filter((p) => byCode.has(p)) ?? [];
      const d = parents.length
        ? 1 + Math.max(...parents.map((p) => depth(p, next)))
        : 0;
      cache.set(code, d);
      return d;
    };
    const levels = new Map<number, Node[]>();
    for (const n of nodes) {
      const d = depth(n.code, new Set());
      levels.set(d, [...(levels.get(d) ?? []), n]);
    }
    const positions = new Map<string, { x: number; y: number }>();
    for (const [level, group] of levels)
      group.forEach((n, i) =>
        positions.set(n.code, { x: 32 + level * 68, y: 30 + i * 52 }),
      );
    return {
      positions,
      width: Math.max(260, 64 + levels.size * 68),
      height: Math.max(
        100,
        60 + Math.max(0, ...[...levels.values()].map((v) => v.length - 1)) * 52,
      ),
    };
  }, [nodes]);
  return (
    <div
      className="overflow-x-auto rounded-slab border border-edge bg-well p-3"
      aria-label="Checkpoint prerequisites"
    >
      <svg
        role="img"
        aria-label="Map of proposed checkpoints and prerequisites"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ minWidth: layout.width, width: "100%" }}
      >
        {nodes.flatMap((n) =>
          n.prereqs.map((parent) => {
            const a = layout.positions.get(parent),
              b = layout.positions.get(n.code);
            return a && b ? (
              <line
                key={`${parent}-${n.code}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--amber-line-2)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
              />
            ) : null;
          }),
        )}
        {nodes.map((n) => {
          const pos = layout.positions.get(n.code)!;
          return (
            <g
              key={n.code}
              role="button"
              tabIndex={0}
              aria-label={`Select ${n.code} ${n.title}`}
              onClick={() => onSelect(n.code)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(n.code);
                }
              }}
            >
              <circle cx={pos.x} cy={pos.y} r="23" fill="transparent" />
              <circle
                cx={pos.x}
                cy={pos.y}
                r="18"
                fill={selected === n.code ? "var(--amber)" : "var(--raised)"}
                stroke="var(--amber-line-2)"
              />
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fontSize="8"
                fontWeight="600"
                fill={selected === n.code ? "var(--amber-ink)" : "var(--ink)"}
              >
                {n.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
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
    [expanded, setExpanded] = useState(false),
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
              selected={current?.code ?? ""}
              onSelect={setSelected}
            />
          )}
          <div className="flex flex-col gap-2">
            {(expanded ? nodes : nodes.slice(0, 5)).map((node) => (
              <Slab key={node.code} className="rounded-slab p-4">
                <button
                  type="button"
                  onClick={() => setSelected(node.code)}
                  aria-expanded={current?.code === node.code}
                  className="flex min-h-11 w-full items-center gap-3 text-left"
                >
                  <span className="w-[46px] shrink-0 rounded-s border border-amber-line py-1 text-center text-label font-semibold text-amber">
                    {node.code}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold leading-snug">{node.title}{node.stage&&<span className="mt-1 block text-label font-normal text-ink-3">{node.stage}</span>}</span>
                  <MessageSquare size={17} className="text-ink-3" />
                </button>
                {current?.code === node.code && (
                  <div className="ml-1 mt-3 flex flex-col gap-3 text-body text-ink-2">
                    <div className="flex gap-2 font-math text-body-l">
                      <Target size={17} className="mt-1 shrink-0 text-amber" />
                      <MathText source={node.criterion} className="min-w-0 flex-1"/>
                    </div>
                    <p className="flex gap-2">
                      <BookOpen size={16} className="shrink-0" />
                      {node.source
                        ? `${node.source}${node.pages ? ` pp. ${node.pages}` : ""} · `
                        : ""}
                      {node.steps.length} steps
                    </p>
                  </div>
                )}
              </Slab>
            ))}
            {nodes.length > 5 && !expanded && (
              <button
                className="min-h-11 text-left text-amber"
                onClick={() => setExpanded(true)}
              >
                {nodes.length - 5} more
              </button>
            )}
          </div>
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
          <p className="flex items-center gap-2 text-label text-ink-3">
            <Waypoints size={17} />
            {p.plan?.concepts?.length ??
              new Set(
                p.planChange?.ops.flatMap((op) =>
                  op.op === "add" ? (op.concepts ?? []) : [],
                ) ?? [],
              ).size}{" "}
            ideas in your Atlas
          </p>
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
