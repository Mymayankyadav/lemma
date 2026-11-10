import { useState, type ReactNode } from "react";
import {motion,useReducedMotion} from "motion/react";
import { ArrowRight, Check, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import * as UI from "../../ui/v7/components";
import { Emblem } from "../../ui/v7/Emblem";
import { Chart, Heatmap, HorizontalBars } from "../../ui/v7/Chart";
import { haptic } from "../../ui/v7/haptics";
import { transitionPresets } from "../../ui/v7/motion";
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="v7-kit-section" aria-label={title}>
      <h2 className="v7-headline">{title}</h2>
      {children}
    </section>
  );
}
export default function V7Page() {
  const reduced=!!useReducedMotion();
  const [proof,setProof]=useState(0);
  const [theme, setTheme] = useState(
      document.documentElement.dataset.theme === "graph-night"
        ? "Night"
        : "Day",
    ),
    [segment, setSegment] = useState("Overview"),
    [tab, setTab] = useState("Cards"),
    [checked, setChecked] = useState(true),
    [enabled, setEnabled] = useState(true),
    [amount, setAmount] = useState(45),
    [steps, setSteps] = useState(3),
    [subject, setSubject] = useState("Analysis"),
    [date, setDate] = useState("2026-11-09"),
    [times, setTimes] = useState(["09:00", "09:50"]),
    [sheet, setSheet] = useState(false),
    [confirm, setConfirm] = useState(false),
    [toast, setToast] = useState(""),
    [filter, setFilter] = useState(true),
    [filterAll, setFilterAll] = useState(false),
    [pressed, setPressed] = useState(true),
    [radio, setRadio] = useState("25 min"),
    [toastSample, setToastSample] = useState(true);
  function notify(message: string) {
    setToast(message);
  }
  return (
    <main className="v7-kit" id="main-content">
      <header className="v7-kit-header">
        <div className="v7-between">
          <p className="v7-eyebrow">Lemma · Constellation</p>
          <span className="v7-caption">Component library / 02</span>
        </div>
        <h1 className="v7-display">A little more clarity.</h1>
        <p className="v7-reading">
          Room to think. {theme === "Day" ? "A warm page" : "A quiet night canvas"}, a clear next step, and the mathematics at
          the centre.
        </p>
        <UI.Segmented
          label="Theme"
          options={["Day", "Night"]}
          value={theme}
          onChange={(value) => {
            setTheme(value);
            document.documentElement.dataset.theme =
              value === "Night" ? "graph-night" : "graph";
          }}
        />
        <p className="v7-meta">
          Shared components, mathematical emblems and accessible charts.
        </p>
      </header>
      <UI.Card hero subject={1}>
        <div className="v7-stack">
          <div className="v7-wrap">
            <UI.Chip kind="subject">Analysis</UI.Chip>
            <UI.Chip kind="ready">Ready to begin</UI.Chip>
            <UI.Chip kind="live">50 min</UI.Chip>
            <UI.Chip kind="mastery">Demonstrated</UI.Chip>
          </div>
          <h2 className="v7-title">Make space for a proof.</h2>
          <p className="v7-reading">A clear intention makes the next session easier to start.</p>
          <UI.Button variant="primary" onClick={() => setSheet(true)}>
            Start a session <ArrowRight aria-hidden="true" />
          </UI.Button>
        </div>
      </UI.Card>
      <div className="v7-kit-grid">
        <Section title="Mathematical emblems">
          <p className="v7-meta">The same path keeps the same mathematical drawing.</p>
          <div className="v7-emblem-gallery">
            {["Analysis", "Linear algebra", "Topology", "Number theory", "Other"].map((name, i) => (
              <div key={name} className={`v7-subject-${i + 1}`}><Emblem subject={name} seed={`path-${i}`} animate={false}/><p className="v7-caption">{name}</p></div>
            ))}
          </div>
          <UI.Button onClick={() => { haptic("complete", true); setProof(proof+1); notify("Completion feedback"); }}>Try completion feedback</UI.Button>
          {proof>0&&<motion.span key={proof} {...transitionPresets(reduced).completion} className="v7-proof-mark" aria-label="Proof complete">∎</motion.span>}
        </Section>
        <Section title="Data graphics">
          <Chart title="Study time" kind="stacked" series={[{label:"Analysis",color:"var(--v7-subject-1)"},{label:"Algebra",color:"var(--v7-subject-2)"}]} data={[{label:"Mon",values:[2,1]},{label:"Tue",values:[3,2]},{label:"Wed",values:[1,2]}]} format={n=>`${n} h`}/>
          <Chart title="Recall" kind="line" series={[{label:"Recall"}]} data={[{label:"Mon",values:[72]},{label:"Tue",values:[86]},{label:"Wed",values:[91]}]} format={n=>`${Math.round(n)}%`}/>
          <Heatmap title="Activity" data={Array.from({length:28},(_,i)=>({date:new Date(Date.UTC(2026,9,5+i)).toISOString().slice(0,10),value:i%5}))}/>
          <HorizontalBars title="Time by subject" data={[{label:"Analysis",value:6,color:"var(--v7-subject-1)"},{label:"Algebra",value:4,color:"var(--v7-subject-2)"}]} format={n=>`${n} h`}/>
        </Section>
        <Section title="Actions">
          <div className="v7-wrap">
            <UI.Button variant="primary" onClick={() => notify("Changes saved")}>
              Save changes
            </UI.Button>
            <UI.Button variant="secondary" onClick={() => notify("Preview opened")}>
              Preview
            </UI.Button>
            <UI.IconButton
              label="More actions"
              onClick={() => notify("More actions selected")}
            >
              <MoreHorizontal />
            </UI.IconButton>
          </div>
          <div className="v7-wrap">
            <UI.Button small>Small secondary</UI.Button>
            <UI.Button small variant="ghost">
              Small ghost
            </UI.Button>
            <UI.Button small aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
              Pressed state
            </UI.Button>
          </div>
          <div className="v7-wrap">
            <UI.Button disabled>Unavailable</UI.Button>
            <UI.Button loading>Saving changes</UI.Button>
            <UI.Button
              destructive
              variant="ghost"
              onClick={() => setConfirm(true)}
            >
              Delete session
            </UI.Button>
          </div>
          <p className="v7-meta">
            Focus with Tab. Press with Enter or Space. The pressed example toggles;
            Delete session opens a confirmation sheet.
          </p>
        </Section>
        <Section title="Subjects and states">
          <div className="v7-wrap">
            {[
              "Analysis",
              "Algebra",
              "Topology",
              "Number theory",
              "Geometry",
              "Logic",
              "Probability",
              "Combinatorics",
            ].map((name, i) => (
              <UI.Chip key={name} kind="subject" subject={i + 1}>
                {name}
              </UI.Chip>
            ))}
          </div>
          <div className="v7-wrap">
            <UI.Chip>Neutral</UI.Chip>
            <UI.Chip kind="status">Complete</UI.Chip>
            <UI.Chip onClick={() => setFilter(!filter)} selected={filter}>
              Due today
            </UI.Chip>
            <UI.Chip onClick={() => setFilterAll(!filterAll)} selected={filterAll}>
              All cards
            </UI.Chip>
          </div>
          <p className="v7-good">✓ Good · On track</p>
          <p className="v7-warning">△ Warning · Needs a moment</p>
          <p className="v7-serious">! Serious · Review needed</p>
          <p className="v7-critical">× Critical · Could not save</p>
        </Section>
        <Section title="Navigation">
          <UI.Segmented
            label="Progress views"
            options={["Overview", "Learning", "Time"]}
            value={segment}
            onChange={setSegment}
          />
          <p className="v7-reading" role="tabpanel">
            {segment === "Overview" ? "See your learning, time and recall together." :
              segment === "Learning" ? "Follow the ideas you have demonstrated." :
              "See where your focused minutes have gone."}
          </p>
          <UI.Segmented
            tabs
            label="Library views"
            options={["Cards", "Practice", "Atlas"]}
            value={tab}
            onChange={setTab}
          />
          <p className="v7-reading" role="tabpanel">
            {tab === "Cards" ? "Review the ideas that are ready to return." :
              tab === "Practice" ? "Try a question before seeing the answer." :
              "Explore how your mathematical ideas connect."}
          </p>
          <div className="v7-menu-preview">
          <UI.Menu
            label="Open menu"
            defaultOpen
            items={[
              {
                label: "Mark complete",
                icon: <Check />,
                onClick: () => notify("Marked complete"),
              },
              {
                label: "Undo changes",
                icon: <Undo2 />,
                onClick: () => notify("Changes undone"),
              },
              {
                label: "Delete session",
                icon: <Trash2 />,
                onClick: () => setConfirm(true),
              },
            ]}
          />
          </div>
        </Section>
        <Section title="Fields">
          <UI.Field
            label="Session intention"
            placeholder="What will you understand?"
          />
          <UI.Field
            label="Checkpoint name"
            defaultValue=""
            error="Add a name before continuing."
          />
          <UI.Field label="Read only" value="Compactness" readOnly />
          <UI.Field
            label="Keyboard focus example"
            className="v7-focus-example"
            placeholder="Focus with Tab to try it"
          />
          <UI.Field
            label="Unavailable field"
            placeholder="Not available"
            disabled
          />
          <UI.Picker
            label="Subject"
            value={subject}
            options={["Analysis", "Algebra", "Topology", "Other"]}
            onChange={setSubject}
          />
          <UI.Picker
            label="Unavailable picker"
            value="Analysis"
            options={["Analysis"]}
            onChange={() => {}}
            disabled
          />
        </Section>
        <Section title="Date and time">
          <UI.DatePicker value={date} onChange={setDate} />
          <UI.TimePicker
            start={times[0]}
            end={times[1]}
            onChange={(start, end) => setTimes([start, end])}
          />
        </Section>
        <Section title="Small controls">
          <div role="radiogroup" aria-label="Session pace" className="v7-stack">
            <span className="v7-control-label">Session pace</span>
            {["25 min", "50 min"].map((option) => (
              <UI.RadioOption
                key={option}
                name="session-pace"
                label={option}
                checked={radio === option}
                onChange={() => setRadio(option)}
              />
            ))}
          </div>
          <UI.Checkbox
            label="Include review cards"
            checked={checked}
            onChange={setChecked}
          />
          <UI.Checkbox
            label="Some cards selected"
            checked={false}
            mixed
            onChange={setChecked}
          />
          <UI.Checkbox
            label="Unavailable checkbox"
            checked={false}
            disabled
            onChange={() => {}}
          />
          <UI.Switch
            label="Session reminders"
            checked={enabled}
            onChange={setEnabled}
          />
          <UI.Switch
            label="Unavailable switch"
            checked={false}
            disabled
            onChange={() => {}}
          />
          <UI.Slider
            label="Session length"
            value={amount}
            onChange={setAmount}
          />
          <div className="v7-between">
            <span className="v7-control-label">Daily sessions</span>
            <UI.Stepper
              label="Daily sessions"
              value={steps}
              onChange={setSteps}
              max={5}
            />
          </div>
        </Section>
        <Section title="Surfaces and rows">
          <UI.Card>
            <div className="v7-stack">
              <p className="v7-eyebrow">Topology</p>
              <h3 className="v7-headline">Every open cover…</h3>
              <p className="v7-reading">
                A compact space gives you a finite subcover.
              </p>
            </div>
          </UI.Card>
          <UI.ListRow
            lead="∫"
            title="Compactness"
            meta="Analysis · Checkpoint 4"
          />
          <UI.ListRow
            lead="λ"
            title="Linear transformations"
            meta="Algebra · 12 cards"
          />
          <UI.ListRow
            lead="τ"
            title="Continuous maps"
            meta="Topology · Demonstrated"
            trailing={<Check aria-label="Demonstrated" />}
          />
        </Section>
        <Section title="Measures">
          <div className="v7-columns">
            <UI.StatTile
              label="Focused today"
              value="50 min"
              change="+25 min vs yesterday"
            />
            <UI.StatTile label="Cards reviewed" value="23" />
          </div>
          <UI.Meter label="Analysis" value={65} subject={1} />
          <UI.Meter label="Algebra" value={40} subject={2} />
          <UI.Meter label="Topology" value={90} subject={3} />
          <UI.Meter label="Not started" value={0} subject={7} />
          <UI.Meter label="Complete" value={100} subject={8} />
        </Section>
        <Section title="Feedback">
          <UI.Banner
            action="Retry"
            onAction={() => notify("Connection restored")}
          >
            Offline · Your changes stay on this device.
          </UI.Banner>
          <UI.Banner
            tone="critical"
            action="Retry"
            onAction={() => notify("Saved successfully")}
          >
            Could not save your changes.
          </UI.Banner>
          <UI.Button onClick={() => notify("Session removed")}>
            Show undo toast
          </UI.Button>
          {toastSample ? (
            <UI.Toast
              preview
              message="A session was removed"
              action="Undo"
              onAction={() => setToastSample(false)}
              onClose={() => setToastSample(false)}
            />
          ) : (
            <UI.Button onClick={() => setToastSample(true)}>Show toast example</UI.Button>
          )}
          <UI.Skeleton />
          <UI.EmptyState
            action="Add a path"
            onAction={() => notify("Path form opened")}
          >
            Your next idea belongs here.
          </UI.EmptyState>
        </Section>
        <Section title="Typography">
          <p className="v7-display">Display · 48</p>
          <p className="v7-title">Title · 36</p>
          <p className="v7-headline">Headline · 28</p>
          <p className="v7-reading-l">A proof begins with a question.</p>
          <p className="v7-reading">
            <em>Every sequence has a story. · 18</em>
          </p>
          <p>Body · Instrument Sans · 16</p>
          <p className="v7-meta">Supporting text · 14</p>
          <p className="v7-caption">Caption · 12</p>
          <p className="v7-eyebrow">Eyebrow</p>
          <div className="v7-wrap">
            <p className="v7-figure-xl">64</p>
            <p className="v7-figure-l">48</p>
            <p className="v7-figure-m">28</p>
          </div>
          <p className="v7-glyph">∫ λ τ ∂ ∑ ∎ ℓ ∞</p>
          <code className="v7-code">lemma / connector / v7</code>
        </Section>
      </div>
      <UI.Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Make room for focus"
        eyebrow="New session"
        footer={
          <UI.Button
            variant="primary"
            onClick={() => {
              setSheet(false);
              notify("Session ready");
            }}
          >
            Save session
          </UI.Button>
        }
      >
        <UI.Field
          label="Intention"
          placeholder="Understand one useful idea"
          autoFocus
        />
        <p className="v7-reading">
          The body scrolls while your next step stays within reach.
        </p>
        {Array.from({ length: 8 }, (_, i) => (
          <UI.ListRow
            key={i}
            lead="∫"
            title={`Checkpoint ${i + 1}`}
            meta="Analysis · Ready to explore"
          />
        ))}
      </UI.Sheet>
      <UI.Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this session?"
        eyebrow="Confirm deletion"
        footer={
          <UI.Button
            destructive
            onClick={() => {
              setConfirm(false);
              notify("Session removed");
            }}
          >
            Delete session
          </UI.Button>
        }
      >
        <p>Your saved session will be removed.</p>
        <UI.Button variant="ghost" onClick={() => setConfirm(false)}>
          Keep session
        </UI.Button>
      </UI.Sheet>
      {toast && (
        <UI.Toast
          message={toast}
          action="Undo"
          onAction={() => notify("Changes undone")}
          onClose={() => setToast("")}
        />
      )}
    </main>
  );
}
