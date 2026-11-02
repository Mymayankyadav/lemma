import {SectionHeading} from '../../ui/SectionHeading';
import {useOnlineStatus} from '../../ui/useOnlineStatus';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpen,
  CircleHelp,
  List,
  PencilLine,
  Zap,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  useHome,
  useReviewLog,
  useRotateConnectorSecret,
  useSettings,
  useSignOut,
  useStyles,
  useUpdateSettings,
} from "../../data/hooks";
import { getApi } from "../../data";
import { getMode } from "../../data/mode";
import { renderMarkdown } from "../../lib/render";
import type {
  OptimizerMessage,
  OptimizerRequest,
} from "../../lib/optimizer.worker";
import { Button } from "../../ui/Button";
import { EuclidAppearance } from "./EuclidAppearance";
import { ConnectorAddress } from "./ConnectorAddress";
import { SubjectsPanel } from "./SubjectsPanel";
import { Chip } from "../../ui/Chip";
import { IconButton } from "../../ui/IconButton";
import { Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { Slab } from "../../ui/Slab";
import { PlugArt } from "../../ui/art/PlugArt";
import { useToast } from "../../ui/Toast";
import { useNavigate } from "react-router";
import type { LucideIcon } from "lucide-react";
const styleIcons: Record<string, LucideIcon> = {
  "circle-help": CircleHelp,
  list: List,
  "pencil-line": PencilLine,
  zap: Zap,
  eye: Eye,
  "book-open": BookOpen,
};
function StyleIcon({ name }: { name: string }) {
  const Icon = styleIcons[name] ?? Sparkles;
  return (
    <Icon
      aria-hidden="true"
      size={19}
      className="shrink-0 text-ink-2"
    />
  );
}
const field =
  "mt-3 min-h-32 w-full rounded-ctl border border-edge bg-well p-3 text-ink";
function elapsed(at: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(at)) / 60000),
  );
  return minutes < 60
    ? `${minutes} min ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)} h ago`
      : `${Math.floor(minutes / 1440)} days ago`;
}
export default function Page() {
  const settings = useSettings(),
    styles = useStyles(),
    home = useHome(),
    reviews = useReviewLog(),
    update = useUpdateSettings(),
    rotate = useRotateConnectorSecret(),
    signOut = useSignOut(),
    notify = useToast(),
    navigate = useNavigate();
  const online = useOnlineStatus(), offline = !online;
  const [revealed, setRevealed] = useState(false),
    [setup, setSetup] = useState(false),
    [sheet, setSheet] = useState<
      "rotate" | "rules" | "macros" | "optimizer" | null
    >(null),
    [rules, setRules] = useState(""),
    [macros, setMacros] = useState(""),
    [retention, setRetention] = useState<number | null>(null),
    [slow, setSlow] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [result, setResult] = useState<
      Extract<OptimizerMessage, { type: "result" }>["result"] | null
    >(null);
  const worker = useRef<Worker | null>(null),
    active = useRef("");
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!settings.isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [settings.isLoading]);
  useEffect(() => {
    if (settings.isError)
      notify("Couldn't load settings.", {
        tone: "danger",
        action: { label: "Try again", onClick: () => void settings.refetch() },
      });
  }, [settings.isError]);
  const s = settings.data,
    preview = useMemo(
      () => renderMarkdown("$\\R \\quad \\norm{x}$", { macros }),
      [macros],
    );
  const save = async (patch: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(patch);
      return true;
    } catch {
      notify("Couldn't save settings.", { tone: "danger" });
      return false;
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied");
    } catch {
      notify("Couldn't copy. Try again.", { tone: "danger" });
    }
  };
  const download = async () => {
    try {
      const blob = await getApi().exportAll(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `lemma-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Backup downloaded");
    } catch {
      notify("Couldn't download the backup.", { tone: "danger" });
    }
  };
  const tune = () => {
    if (!s || !reviews.data || reviews.data.length < 400) return;
    worker.current?.terminate();
    const w = new Worker(
        new URL("../../lib/optimizer.worker.ts", import.meta.url),
        { type: "module" },
      ),
      id = crypto.randomUUID();
    worker.current = w;
    active.current = id;
    setProgress(0);
    setResult(null);
    setSheet("optimizer");
    w.onmessage = (event: MessageEvent<OptimizerMessage>) => {
      const message = event.data;
      if (message.id !== active.current) return;
      if (message.type === "progress") setProgress(message.fraction);
      else {
        setProgress(null);
        w.terminate();
        worker.current = null;
        if (message.type === "result") setResult(message.result);
        else notify(message.message, { tone: "danger" });
      }
    };
    w.onerror = () => {
      setProgress(null);
      w.terminate();
      worker.current = null;
      notify("Optimization failed.", { tone: "danger" });
    };
    const request: OptimizerRequest = {
      type: "optimize",
      id,
      reviews: reviews.data,
      settings: s,
    };
    w.postMessage(request);
  };
  if (settings.isLoading)
    return (
      <Screen title="Settings" back="/">
        {slow && (
          <>
            <Skeleton w="100%" h={200} />
            <Skeleton w="100%" h={150} />
          </>
        )}
      </Screen>
    );
  if (!s)
    return (
      <Screen title="Settings" back="/">
        <p className="text-ink-2">Settings could not be loaded.</p>
        <Button variant="ghost" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </Screen>
    );
  if (offline) return <Screen title="Settings" back="/" className="pb-8">
    <Slab className="p-5" aria-label="Saved settings">
      <h2 className="text-headline font-semibold">Saved settings · read only</h2>
      <p className="mt-2 text-body text-ink-2">Needs a connection to change settings or view your connector address.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-body">
        <div><dt className="text-ink-3">Time zone</dt><dd>{s.timeZone}</dd></div>
        <div><dt className="text-ink-3">Rollover hour</dt><dd>{s.rolloverHour}:00</dd></div>
        <div><dt className="text-ink-3">Tutor</dt><dd>{s.preferredChat}</dd></div>
        <div><dt className="text-ink-3">Style</dt><dd>{s.defaultStyle}</dd></div>
        <div><dt className="text-ink-3">Mix decks</dt><dd>{s.mixDecks ? 'On' : 'Off'}</dd></div>
        <div><dt className="text-ink-3">New cards per day</dt><dd>{s.newPerDay}</dd></div>
      </dl>
    </Slab>
  </Screen>;
  // The offline projection deliberately omits the connector and all write-only
  // preferences. Never enable online settings actions until the live record arrives.
  if (typeof s.connectorUrl !== 'string') return <Screen title="Settings" back="/">
    <Slab className="p-5"><p className="text-ink-2">Refreshing settings from Lemma…</p>
      <Button className="mt-3" needsNetwork onClick={() => void settings.refetch()}>Try again</Button>
    </Slab>
  </Screen>;
  const connected = !!s.connectorLastSeenAt,
    masked = s.connectorUrl.replace(/\/[^/]+$/, "/••••••"),
    busy = update.isPending;
  return (
    <Screen title="Settings" back="/" className="pb-8">
      <EuclidAppearance ui={s.ui} busy={busy} onChange={(patch)=>save({ui:patch})}/>
      <SubjectsPanel/>
      <Slab className="p-5">
        <div className="flex items-center gap-4">
          <PlugArt connected={connected} size={92} />
          <div>
            <h3 className="text-[16px] leading-5 font-semibold" style={{fontFamily:"var(--font-ui)",fontWeight:600,lineHeight:"20px"}}>
              {connected ? "Connected" : "Not connected yet"}
            </h3>
            <p className="mt-1 text-label text-ink-3">
              {s.connectorLastSeenAt
                ? `Last call ${elapsed(s.connectorLastSeenAt)}${s.connectorLastClient ? `, ${s.connectorLastClient === "claude" ? "Claude" : s.connectorLastClient === "chatgpt" ? "ChatGPT" : s.connectorLastClient}` : ""}`
                : "Connect your tutor to get started."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 rounded-ctl bg-well p-2">
          <ConnectorAddress value={revealed ? s.connectorUrl : masked} />
          <IconButton
            icon={revealed ? EyeOff : Eye}
            label={
              revealed ? "Hide connector address" : "Show connector address"
            }
            tone="plain"
            onClick={() => setRevealed((v) => !v)}
          />
          <IconButton
            icon={Copy}
            label="Copy connector address"
            tone="plain"
            onClick={() => void copy(s.connectorUrl)}
          />
        </div>
        <button
          className="mt-3 min-h-11 text-label font-semibold text-ink-2"
          onClick={() => setSheet("rotate")}
        >
          Make a new address
        </button>
      </Slab>
      <section>
        <SectionHeading className="mb-3">Apps</SectionHeading>
        <Slab className="divide-y divide-edge px-4">
          <div className="flex min-h-[68px] items-center gap-3">
            <Sparkles className="text-amber" size={20} />
            <div className="flex-1">
              <p className="font-semibold">Claude</p>
              <p className="text-label text-ink-3">Phone and web</p>
            </div>
            {s.connectorLastClient === "claude" && (
              <Check className="text-easy" size={19} />
            )}
          </div>
          <div className="flex min-h-[68px] items-center gap-3">
            <Bot className="text-ink-2" size={20} />
            <div className="flex-1">
              <p className="font-semibold">ChatGPT</p>
              <p className="text-label text-ink-3">Web, developer mode</p>
            </div>
            <Chip
              tone="amber"
              selected={setup}
              onClick={() => setSetup((v) => !v)}
            >
              Set up
            </Chip>
          </div>
          {setup && (
            <ol className="list-decimal space-y-3 pb-5 pl-6 pt-2 text-label leading-relaxed text-ink-2">
              <li>
                In ChatGPT settings, open Apps, then Advanced settings and
                enable Developer mode.
              </li>
              <li>
                Create an app named Lemma using the connector address above and
                choose No authentication.
              </li>
              <li>
                In a new chat, use the + menu to enable Lemma. Confirm writes
                when prompted.
              </li>
            </ol>
          )}
        </Slab>
      </section>
      <section>
        <SectionHeading className="mb-3">Say this to start</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {home.data?.resume && (
            <Chip
              onClick={() =>
                void copy(`Resume ${home.data!.resume!.projectTitle}`)
              }
            >
              Resume {home.data.resume.projectTitle}
            </Chip>
          )}
          {home.data?.projects.find((p) => p.status === "planning") && (
            <Chip
              onClick={() =>
                void copy(
                  `Plan ${home.data!.projects.find((p) => p.status === "planning")!.title}`,
                )
              }
            >
              Plan a project
            </Chip>
          )}
          <Chip onClick={() => void copy("Update my cards")}>
            Update my cards
          </Chip>
        </div>
      </section>
      <section>
        <SectionHeading className="mb-3">Teaching style</SectionHeading>
        <div role="radiogroup" aria-label="Teaching style" data-teaching-style-list="true"
          className="divide-y divide-edge rounded-slab border border-edge bg-[var(--paper)]">
          {styles.data?.map((style) => (
            <button
              role="radio"
              aria-checked={s.defaultStyle === style.key}
              key={style.key}
              disabled={busy}
              onClick={() => void save({ defaultStyle: style.key })}
              className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-body ${s.defaultStyle === style.key ? "bg-[var(--fill-1)] font-semibold text-ink" : "text-ink-2"}`}
            >
              <StyleIcon name={style.icon} />
              <span className="min-w-0 flex-1">{style.name}</span>
              {s.defaultStyle === style.key && <Check size={18} className="shrink-0 text-ink" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button
          className="mt-3 min-h-11 text-body font-semibold text-ink-2"
          onClick={() => {
            setRules(s.tutorRules ?? "");
            setSheet("rules");
          }}
        >
          Tutor rules
        </button>
      </section>
      <section>
        <SectionHeading className="mb-3">Memory</SectionHeading>
        <Slab className="p-5">
          <div className="flex justify-between">
            <label htmlFor="retention" className="font-semibold">
              Target recall
            </label>
            <span className="font-semibold text-ink">
              {Math.round((retention ?? s.desiredRetention) * 100)}%
            </span>
          </div>
          <input
            id="retention"
            type="range"
            min="80"
            max="97"
            step="1"
            value={Math.round((retention ?? s.desiredRetention) * 100)}
            onChange={(e) => setRetention(Number(e.target.value) / 100)}
            onPointerUp={(e) => {
              const value = Number(e.currentTarget.value) / 100;
              void save({ desiredRetention: value }).then(() =>
                setRetention(null),
              );
            }}
            onKeyUp={(e) => {
              const value = Number(e.currentTarget.value) / 100;
              void save({ desiredRetention: value }).then(() =>
                setRetention(null),
              );
            }}
            className="my-3 w-full accent-amber"
          />
          <p className="text-label text-ink-3">
            Higher means more reviews each day.
          </p>
          <div className="mt-4 flex min-h-14 items-center justify-between">
            <span>New cards a day</span>
            <div className="flex items-center gap-3">
              <IconButton
                icon={Minus}
                label="Fewer new cards"
                tone="plain"
                disabled={busy || s.newPerDay <= 0}
                onClick={() =>
                  void save({ newPerDay: Math.max(0, s.newPerDay - 5) })
                }
              />
              <span className="w-6 text-center">{s.newPerDay}</span>
              <IconButton
                icon={Plus}
                label="More new cards"
                tone="plain"
                disabled={busy || s.newPerDay >= 60}
                onClick={() =>
                  void save({ newPerDay: Math.min(60, s.newPerDay + 5) })
                }
              />
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={!reviews.data || reviews.data.length < 400}
            onClick={tune}
          >
            Tune to my reviews
          </Button>
          {(reviews.data?.length ?? 0) < 400 && (
            <p className="mt-2 text-label text-ink-3">
              Needs 400 reviews (you have {reviews.data?.length ?? 0})
            </p>
          )}
        </Slab>
      </section>
      <section>
        <SectionHeading className="mb-3">More</SectionHeading>
        <div data-settings-actions="true" className="divide-y divide-edge rounded-slab border border-edge bg-[var(--paper)]">
          <button type="button" className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-body text-ink"
            onClick={() => { setMacros(s.macros); setSheet("macros"); }}>
            <PencilLine size={18} className="shrink-0 text-ink-2" aria-hidden="true" />
            Math shortcuts
          </button>
          <button type="button" className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-body text-ink"
            onClick={() => void download()}>
            <Download size={18} className="shrink-0 text-ink-2" aria-hidden="true" />
            Download a backup
          </button>
        </div>
        <button type="button" data-sign-out="true" disabled={signOut.isPending}
          className="mt-3 flex min-h-11 items-center text-left text-body font-semibold text-[var(--danger)] underline-offset-4 hover:underline focus-visible:underline"
          onClick={async () => {
            try {
              await signOut.mutateAsync();
              if (getMode() !== "demo") void navigate("/sign-in");
            } catch {
              notify("Couldn't sign out.", { tone: "danger" });
            }
          }}>
          Sign out
        </button>
      </section>
      <p className="text-label text-ink-3">
        Lemma · {getMode() === "demo" ? "Demo data" : "Your study record"}
      </p>
      <Sheet
        open={sheet === "rotate"}
        onClose={() => setSheet(null)}
        title="Make a new address?"
      >
        <p className="mb-5 text-ink-2">
          The old address stops working in Claude and ChatGPT.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => setSheet(null)}>
            Cancel
          </Button>
          <Button
            disabled={rotate.isPending}
            icon={RefreshCw}
            onClick={async () => {
              try {
                await rotate.mutateAsync();
                setRevealed(false);
                setSheet(null);
                notify("New address created");
              } catch {
                notify("Couldn't create a new address.", { tone: "danger" });
              }
            }}
          >
            Make new
          </Button>
        </div>
      </Sheet>
      <Sheet
        open={sheet === "rules"}
        onClose={() => setSheet(null)}
        title="Tutor rules"
      >
        <label>
          Rules
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className={field}
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => setRules("")}>
            Reset to default
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await save({ tutorRules: rules.trim() || null })) {
                setSheet(null);
                notify("Tutor rules saved");
              }
            }}
          >
            Save
          </Button>
        </div>
      </Sheet>
      <Sheet
        open={sheet === "macros"}
        onClose={() => setSheet(null)}
        title="Math shortcuts"
      >
        <label>
          KaTeX macros
          <textarea
            value={macros}
            onChange={(e) => setMacros(e.target.value)}
            className={`${field} font-mono text-label`}
          />
        </label>
        <p className="mt-4 text-label text-ink-3">Preview</p>
        <div
          className="lemma-math my-3"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            if (await save({ macros })) {
              setSheet(null);
              notify("Math shortcuts saved");
            }
          }}
        >
          Save
        </Button>
      </Sheet>
      <Sheet
        open={sheet === "optimizer"}
        onClose={() => {
          worker.current?.terminate();
          worker.current = null;
          active.current = "";
          setProgress(null);
          setSheet(null);
        }}
        title="Tune to your reviews"
      >
        {progress !== null ? (
          <p>Analyzing reviews… {Math.round(progress * 100)}%</p>
        ) : result ? (
          <>
            <p className="text-ink-2">
              Log loss: {result.before.logLoss.toFixed(3)} →{" "}
              {result.after.logLoss.toFixed(3)} · {result.items} answers
            </p>
            {result.skipped && (
              <p className="mt-3 text-ink-3">
                There was not enough usable history to tune the model.
              </p>
            )}
            <Button
              className="mt-5 w-full"
              disabled={busy || result.skipped}
              onClick={async () => {
                if (
                  await save({
                    fsrsWeights: result.w,
                    fsrsTunedAt: new Date().toISOString(),
                  })
                ) {
                  setSheet(null);
                  notify("Memory model updated");
                }
              }}
            >
              Apply
            </Button>
          </>
        ) : (
          <p className="text-ink-2">Optimization did not finish. Try again.</p>
        )}
      </Sheet>
    </Screen>
  );
}
