import { useState, type ReactNode, type CSSProperties } from "react";
import { ArrowRight, Check, Trash2, Undo2 } from "lucide-react";
import * as UI from "../../ui/v7/components";
import { Chart, Heatmap, HorizontalBars } from "../../ui/v7/Chart";
import { Emblem } from "../../ui/v7/Emblem";
import { haptic } from "../../ui/v7/haptics";
import {
  subjects, SubjectMark, Tag, Badge, ProofBadge, FilterChip, ToggleButton, StateButton,
  FormField, TimeRangeField, RadioGroup, CheckChoice, SwitchChoice, RangeSlider,
  MasteryBar, ConstellationProgress, StatementCard, StatMeasure, FeedbackBanner,
  SampleToast, EmptyEmblem, ErrorEmblem, type Subject
} from "../../ui/v7/KitPrimitives";
import tokens from "../../ui/v7/design-tokens.json";
import "../../ui/v7/kit-system.css";
import "../../ui/v7/kit-page.css";

type Theme = "graph" | "graph-night";
const modes:Theme[]=["graph","graph-night"];
const name=(theme:Theme)=>theme==="graph"?"Day · paper":"Night · observatory";
const selectedTokens=["surface.page","surface.sunken","surface.raised","surface.muted","text.primary","text.secondary","text.tertiary","border.default","action.bg","selection.subtle","status.success","status.warning","status.danger","subject.analysis","subject.algebra","subject.topology","subject.number-theory","subject.geometry","subject.logic","subject.probability","subject.combinatorics","viz.heat1","viz.heat4"];
const tokenSource=tokens as unknown as {raw:Record<string,Record<string,{$value:string}>>};
function lum(hex:string){const rgb=hex.slice(1).match(/.{2}/g)!.map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:string,b:string){const x=lum(a),y=lum(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(1);}
function Section({number,title,description,children}:{number:string;title:string;description:string;children:ReactNode}){
  return <section className="v7-system-section" aria-label={title}><header><p className="v7-eyebrow">{number} / Constellation UI</p>
    <h2 className="v7-title">{title}</h2><p>{description}</p></header>{children}</section>;
}
function Compare({children,high=false}:{children:(theme:Theme)=>ReactNode;high?:boolean}){
 return <div className="v7-split" aria-label="Day and Night side-by-side comparison">
  {modes.map(theme=><div key={theme} data-v7="" data-theme={theme} data-contrast={high?"high":undefined} className="v7-split-panel">
   <div className="v7-panel-label"><span>{name(theme)}</span><span>{high?"High contrast":"Standard"}</span></div>
   <div className="v7-panel-content">{children(theme)}</div>
  </div>)}
 </div>;
}
function DemoNote({children}:{children:ReactNode}){return <p className="v7-kit-notes">{children}</p>;}
function TokenPalette({theme}:{theme:Theme}){
 const mode=theme==="graph"?"day":"night";
 const data=tokenSource.raw[mode];
 return <div className="v7-token-grid">
 {selectedTokens.map(key=>{const value=data[key]?.$value??"#000000";
  const role=key.replaceAll(".","-");
  const pair=key==="action.bg"?"text.on-action":
    key==="selection.subtle"?"selection.fg":
    key.startsWith("surface.")?"text.primary":"surface.page";
  const ratio=contrast(value,data[pair].$value);
  return <div className="v7-token-card" key={key}>
   <span className="v7-token-swatch" style={{"--token-color":"var(--v7-role-"+role+")"} as CSSProperties}/>
   <div className="v7-token-caption"><b>{key}</b><span>{value}</span><span>Contrast {ratio}:1</span></div>
  </div>;
 })}
 </div>;
}
function TypeSpecimen(){
 const styles:[string,string,string][]=[
  ["Display · 44/48 (56/60 desktop) · Newsreader","v7-display","The shape of an idea."],
  ["Title · 32/38 (40/46 desktop) · Newsreader","v7-title","Your mathematical journey"],
  ["Headline · 26/32 (30/36 desktop) · Newsreader","v7-headline","Every proof has a beginning"],
  ["Subhead · 20/26 · Newsreader","v7-subhead","A finite subcover"],
  ["Lead · 19/30 · Newsreader","v7-intro","A proof begins with a good question."],
  ["Reading · 17/28 · Newsreader","v7-reading","Let each open neighbourhood contain a useful observation."],
  ["Body · 16/24 · Instrument Sans","", "Choose one idea to explore next."],
  ["Label · 14/20 · Instrument Sans","v7-control-label","Session intention"],
  ["Supporting · 14/20 · Instrument Sans","v7-meta","Review this checkpoint when you're ready."],
  ["Caption · 12/16 · Instrument Sans","v7-caption","05 NOV · 09:50"],
  ["Mono · 14/20 · IBM Plex Mono","v7-code","lemma / v7 / 1.0"]
 ];
 return <div>{styles.map(([role,cls,copy])=><div className="v7-type-card" key={role}>
  <span className="v7-caption">{role}</span><p className={cls}>{copy}</p>
 </div>)}</div>;
}
function EmblemsPanel(){
 const [subject,setSubject]=useState<Subject>("Analysis");
 return <div className="v7-compare-group">
  <div className="v7-emblem-choice-grid">
    {[...subjects,"Other" as const].map(s=><button key={s} aria-pressed={subject===s} type="button" onClick={()=>setSubject(s)}
      className="v7-emblem-choice"><SubjectMark subject={s}/><SubjectMark subject={s} size="tile"/><span>{s}</span></button>)}
  </div>
  <div className={"v7-emblem-stage v7-subject-"+(subjects.indexOf(subject as typeof subjects[number])+1)}>
   <Emblem subject={subject} seed={"path-"+subject} size={164} animate={false}/>
   <div><p className="v7-eyebrow">Hero · 164 px</p><p className="v7-subhead">{subject}</p>
     <p className="v7-meta">Stable path seed; a mathematical construction, not a stock illustration.</p></div>
  </div>
 </div>;
}
function ComponentsPanel(){
 const [filter,setFilter]=useState(true),[toggle,setToggle]=useState(true),[duration,setDuration]=useState(45);
 const [selection,setSelection]=useState("Overview"),[tab,setTab]=useState("Cards"),[subject,setSubject]=useState("Analysis");
 return <>
  <div className="v7-compare-group"><h3 className="v7-subhead">Actions and button states</h3>
   <div className="v7-demo-row"><StateButton variant="primary">Save changes</StateButton><StateButton>Preview</StateButton>
    <StateButton variant="tertiary">View details</StateButton><StateButton variant="danger">Delete session</StateButton></div>
   <div className="v7-state-grid">
     <div className="v7-state-cell"><small>Rest</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell"><small>Loading</small><StateButton variant="primary" loading>Save changes</StateButton></div>
     <div className="v7-state-cell"><small>Disabled</small><StateButton disabledReason="Finish Checkpoint 3 first.">Continue</StateButton></div>
     <div className="v7-state-cell"><small>Selected</small><ToggleButton selected={toggle} onChange={setToggle}>Pinned</ToggleButton></div>
     <div className="v7-state-cell v7-force-hover"><small>Hover</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell v7-force-press"><small>Pressed</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell v7-force-focus"><small>Focus-visible</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell"><small>Read-only</small><FormField label="Reference" initial="Lemma 4.2" readOnly/></div>
     <div className="v7-state-cell"><small>Invalid</small><FormField label="Required" required showError/></div>
   </div>
   <DemoNote>Hover and press use state layers. Focus uses a two-pixel ring, separated by a two-pixel gap. A loading action retains its label and width.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Tag · Badge · Filter</h3>
   <div className="v7-demo-row"><Tag subject="Analysis"/><Tag subject="Algebra"/><Tag subject="Topology"/></div>
   <div className="v7-demo-row"><Badge>Info · Saved locally</Badge><Badge tone="success">Success · On track</Badge>
    <Badge tone="warning">Warning · Review due</Badge><Badge tone="danger">Danger · Could not save</Badge></div>
   <div className="v7-demo-row"><FilterChip selected={filter} onChange={setFilter}>Due today</FilterChip>
    <FilterChip selected={!filter} onChange={setFilter}>All cards</FilterChip></div>
   <DemoNote>Do: a mathematical glyph identifies a subject, a filled icon identifies status, and a selected check identifies a filter. Don't use one pill for all three jobs.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Forms · every state</h3>
    <FormField label="Session intention" initial="Understand one useful idea" helper="A short phrase is enough."/>
    <FormField label="Description" optional helper="Optional context for later."/>
    <FormField label="Checkpoint name" required showError/>
    <FormField label="Pinned theorem" initial="Compactness" readOnly/>
    <FormField label="Further sessions" disabledReason="Unavailable · Finish Checkpoint 3 first."/>
    <UI.Picker label="Subject" value={subject} options={["Analysis","Algebra","Topology","Other"]} onChange={setSubject}/>
    <TimeRangeField/>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Selection controls</h3>
    <RadioGroup/><CheckChoice/><CheckChoice disabledReason="Unavailable · Start the next review first."/>
    <SwitchChoice/><SwitchChoice disabledReason="Unavailable · Enable reminders in settings."/>
    <RangeSlider label="Study length" value={duration} onChange={setDuration} min={5} max={90} unit="min"/>
    <UI.Segmented label="Progress views" value={selection} options={["Overview","Learning","Time"]} onChange={setSelection}/>
    <div role="tabpanel" className="v7-meta">{selection==="Overview"?"All activity in one place.":selection==="Learning"?"Ideas demonstrated over time.":"Hours focused on mathematics."}</div>
    <UI.Segmented tabs label="Library views" value={tab} options={["Cards","Practice","Atlas"]} onChange={setTab}/>
    <div role="tabpanel" className="v7-meta">{tab==="Cards"?"Cards ready to revisit.":tab==="Practice"?"Practice at your pace.":"Explore mathematical connections."}</div>
    <div className="v7-kit-action-row"><span className="v7-control-label">Daily sessions</span>
      <StepperExample/></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Menus and navigation</h3>
    <UI.Menu label="Open menu" items={[
      {label:"Mark complete",icon:<Check/>,onClick:()=>{}},
      {label:"Undo changes",icon:<Undo2/>,onClick:()=>{}},
      {label:"Delete session",icon:<Trash2/>,onClick:()=>{}}
    ]}/>
    <DemoNote>Menus: Arrow Up/Down to move, Escape to close. Desktop menus accept type-to-jump. The final destructive item is separated and uses Danger.</DemoNote>
  </div>
 </>;
}
function StepperExample(){const [value,setValue]=useState(3);return <UI.Stepper label="Daily sessions" value={value} onChange={setValue} min={0} max={5}/>;}
function PatternPanel(){
 const [sheet,setSheet]=useState(false),[toast,setToast]=useState(true),[finished,setFinished]=useState(false);
 return <>
  <div className="v7-hero-specimen v7-subject-1">
   <SubjectMark subject="Analysis" size="hero"/>
   <div className="v7-demo-row"><Tag subject="Analysis"/><ProofBadge state="progress"/></div>
   <h3 className="v7-title">Make space for a proof.</h3>
   <p className="v7-reading">A clear intention makes the next session easier to begin.</p>
   <p className="v7-meta">50 min · Checkpoint 4 of 7</p>
   <div><StateButton variant="primary">Start session <ArrowRight size={18}/></StateButton></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Proof states</h3>
    <div className="v7-demo-row">{(["conjecture","progress","demonstrated","review"] as const).map(s=><ProofBadge key={s} state={s}/>)}</div>
    <ConstellationProgress/>
    <div className="v7-demo-row"><button className="v7-demo-trigger" type="button" onClick={()=>{setFinished(!finished);haptic("complete",true);}}>
      {finished?"Reset completion":"Try completion feedback"}</button>
    {finished&&<ProofBadge state="demonstrated"/>}</div>
    <DemoNote>∎ means the end of a demonstrated proof. A star fills only after its checkpoint is demonstrated. Reduced motion shows the final state immediately.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Statement cards</h3>
   <StatementCard kind="Theorem" demonstrated/><StatementCard kind="Definition"/><StatementCard kind="Exercise" number="4.3"/>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Measures</h3>
    <div className="v7-columns"><StatMeasure label="Focused today" value="50" unit="min" change="▲ +25 min vs yesterday"/>
      <StatMeasure label="Cards reviewed" value="23" unit="cards"/></div>
    <MasteryBar subject="Analysis" value={65}/><MasteryBar subject="Algebra" value={40}/>
    <MasteryBar subject="Topology" value={100}/><MasteryBar subject="Probability" value={0}/>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Feedback and decisions</h3>
    <FeedbackBanner tone="info">Offline · Changes are saved on this device. Retrying in 10 s.</FeedbackBanner>
    <FeedbackBanner tone="danger" action="Retry now">Couldn't save. Check your connection.</FeedbackBanner>
    <div className="v7-demo-row"><button className="v7-demo-trigger" type="button" onClick={()=>setToast(!toast)}>
      {toast?"Dismiss toast":"Show undo toast"}</button>
      <button className="v7-demo-trigger" type="button" onClick={()=>setSheet(true)}>Open delete confirmation</button></div>
    {toast&&<SampleToast onClose={()=>setToast(false)}/>}
    <UI.Sheet open={sheet} onClose={()=>setSheet(false)} title="Delete this session and its 12 cards?"
      footer={<div className="v7-demo-row"><StateButton onClick={()=>setSheet(false)}>Cancel</StateButton>
        <StateButton variant="confirm" onClick={()=>setSheet(false)}>Delete session</StateButton></div>}>
      <p>The session and its cards will be permanently deleted. This action cannot be undone.</p>
    </UI.Sheet>
    <DemoNote>Reversible actions offer Undo. Permanent actions require confirmation. Never show both for the same operation.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Empty, loading and error</h3>
   <EmptyEmblem/><UI.Skeleton/><ErrorEmblem/>
  </div>
 </>;
}
function ChartsPanel(){
 return <div className="v7-compare-group">
  <div className="v7-viz-card"><Chart title="Study time" kind="stacked" data={[
    {label:"Mon",values:[2,1]},{label:"Tue",values:[3,2]},{label:"Wed",values:[1,2]}]}
    series={[{label:"Analysis",color:"var(--v7-role-subject-analysis)"},{label:"Algebra",color:"var(--v7-role-subject-algebra)"}]} format={n=>n+" h"}/></div>
  <div className="v7-viz-card"><Chart title="Recall" kind="line" area data={[
    {label:"Mon",values:[72]},{label:"Tue",values:[86]},{label:"Wed",values:[91]}]}
    series={[{label:"Recall",color:"var(--v7-role-subject-topology)"}]} format={n=>Math.round(n)+"%"}/></div>
  <div className="v7-viz-card"><Heatmap title="Activity" data={Array.from({length:28},(_,i)=>({
    date:new Date(Date.UTC(2026,9,5+i)).toISOString().slice(0,10),
    value:[0,6,22,45,75][i%5]}))} format={n=>n+" min"}/></div>
  <div className="v7-viz-card"><HorizontalBars title="Time by subject" data={[
    {label:"Analysis",value:6,color:"var(--v7-role-subject-analysis)"},
    {label:"Algebra",value:4,color:"var(--v7-role-subject-algebra)"},
    {label:"Topology",value:3,color:"var(--v7-role-subject-topology)"}]} format={n=>n+" h"}/></div>
 </div>;
}
export default function V7Page(){
 const [theme,setTheme]=useState<"Day"|"Night">(()=>document.documentElement.dataset.theme==="graph-night"?"Night":"Day");
 const [high,setHigh]=useState(false);
 return <main className="v7-kit" id="main-content">
  <header className="v7-kit-header">
   <div className="v7-between"><p className="v7-eyebrow">Lemma · Constellation</p><span className="v7-kit-version">UI Kit / 1.0</span></div>
   <h1 className="v7-display">A little more clarity.</h1>
   <p className="v7-intro">Notebook by day. Observatory by night. One mathematical language for everything you learn.</p>
   <UI.Segmented label="Theme" options={["Day","Night"]} value={theme}
     onChange={t=>{setTheme(t as "Day"|"Night");document.documentElement.dataset.theme=t==="Night"?"graph-night":"graph";
      try {localStorage.setItem("lemma.v7Kit.theme",t);}catch{ /* storage is optional */ }
     }}/> 
   <label className="v7-check-choice"><input type="checkbox" checked={high} onChange={e=>setHigh(e.target.checked)}/>High contrast comparison</label>
   <p className="v7-meta">Day and Night are shown together throughout the kit. Only role-token values change between them.</p>
  </header>
  <Section number="01" title="Principles" description="Six constraints guide every decision, from layout to the completion of a proof.">
    <div className="v7-principles">{[
    ["Quiet by default","One clear next step per screen."],["Every colour has one job","Indigo acts; subjects identify; status explains."],
    ["Shape before hue","Nothing depends on colour alone."],["One system, two lights","Tokens change; behaviour does not."],
    ["Mathematics is the ornament","Every visual construction means something."],["Explain, don't block","Disabled controls say why."]
    ].map(([title,copy],i)=><article className="v7-principle" key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
  </Section>
  <Section number="02" title="Tokens and typography" description="One DTCG source generates four modes, semantic roles, component aliases and a Figma-variable interchange.">
    <Compare high={high}>{theme=><>
      <h3 className="v7-subhead">Role colours · live contrast</h3><TokenPalette theme={theme}/>
      <h3 className="v7-subhead">Type roles</h3><TypeSpecimen/>
      <h3 className="v7-subhead">Space · shape · elevation</h3>
      <div className="v7-token-measures"><span>4</span><span>8</span><span>12</span><span>16</span><span>24</span><span>32</span></div>
      <div className="v7-demo-row"><Tag subject="Analysis"/><Badge>Badge 8 px</Badge><div className="v7-surface-sample">Raised · 16 px</div></div>
      <p className="v7-meta">Motion: 80 · 120 · 200 · 320 · 600 · 900 ms. Reduced motion removes travel and shimmer.</p>
      <button type="button" className="v7-demo-trigger" onClick={e=>e.currentTarget.classList.toggle("v7-motion-play")}>Play motion</button>
    </>}</Compare>
  </Section>
  <Section number="03" title="Icons and mathematical emblems" description="Nine subjects, stable constructions, three levels of detail. Glyphs are typography; drawings are geometric.">
    <Compare high={high}>{()=> <EmblemsPanel/>}</Compare>
  </Section>
  <Section number="04" title="Components and states" description="One interaction model: rest, hover, pressed, selected, focus, disabled, read-only, loading and invalid.">
    <Compare high={high}>{()=> <ComponentsPanel/>}</Compare>
    <DemoNote>Keyboard: Tab to move; arrows within radios and tabs; Space or Enter to activate; Escape to close menus and sheets. Read-only values are selectable. All controls have accessible names.</DemoNote>
  </Section>
  <Section number="05" title="Patterns" description="Single-step heroes, proof-first cards, Constellation progress and feedback that explains the next move.">
    <Compare high={high}>{()=> <PatternPanel/>}</Compare>
  </Section>
  <Section number="06" title="Data visualisation" description="Subject-coded marks, round axes, ink/starlight heatmaps, keyboard details and a data table for each chart.">
    <Compare high={high}>{()=> <ChartsPanel/>}</Compare>
  </Section>
  <Section number="07" title="Changelog" description="Versioned guidance for implementing this system consistently across Lemma.">
    <div className="v7-change-card"><span className="v7-kit-version">1.0.0 · Constellation</span>
      <h3 className="v7-subhead">Notebook and Observatory</h3>
      <p>Introduced four theme modes, a three-tier token system, distinct status and subject anatomy, mathematical statement cards, Constellation progress and accessible data graphics.</p>
      <p className="v7-meta">The v7 feature flag remains off until the Owner approves the gallery, six golden screens, responsive layouts and device accessibility checks.</p>
    </div>
  </Section>
 </main>;
}
