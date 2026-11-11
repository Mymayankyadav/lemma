import { useEffect, useId, useState, type ReactNode, type CSSProperties } from "react";
import { Check, LockKeyhole, Trash2, Undo2 } from "lucide-react";
import * as UI from "../../ui/v7/components";
import { Chart, Heatmap, HorizontalBars } from "../../ui/v7/Chart";
import { Emblem } from "../../ui/v7/Emblem";
import {
  subjects, SubjectMark, Tag, Badge, ProofBadge, FilterChip, ToggleButton, StateButton,
  FormField, TimeRangeField, RadioGroup, CheckChoice, SwitchChoice, RangeSlider,
  MasteryBar, StatementCard, StatMeasure, FeedbackBanner,
  SampleToast, EmptyEmblem, ErrorEmblem, CompletionPattern, PathRow, subjectClass, type Subject
} from "../../ui/v7/KitPrimitives";
import tokens from "../../ui/v7/design-tokens.json";
import "../../ui/v7/kit-system.css";
import "../../ui/v7/kit-page.css";

type Theme = "graph" | "graph-night";
const modes:Theme[]=["graph","graph-night"];
const name=(theme:Theme)=>theme==="graph"?"Day · paper":"Night · observatory";
const selectedTokens=Object.keys(tokens.role).filter(key=>!key.startsWith("state."));
const tokenSource=tokens as unknown as {raw:Record<string,Record<string,{$value:string}>>;role:Record<string,{$description:string;$extensions:{"lemma.contrastWith":string[]}}>};
function lum(hex:string){const rgb=hex.slice(1).match(/.{2}/g)!.map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:string,b:string){const x=lum(a),y=lum(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(1);}
function Section({number,title,description,children}:{number:string;title:string;description:string;children:ReactNode}){
  return <section className="v7-system-section" aria-label={title}><header><p className="v7-eyebrow">{number} / Constellation UI</p>
    <h2 className="v7-headline">{title}</h2><p>{description}</p></header>{children}</section>;
}
function Compare({children,high=false,density="comfortable"}:{children:(theme:Theme)=>ReactNode;high?:boolean;density?:string}){
 return <div className="v7-split" aria-label="Day and Night side-by-side comparison">
  {modes.map(theme=><div key={theme} data-v7="" data-theme={theme} data-contrast={high?"high":undefined} data-density={density} className="v7-split-panel">
   <div className="v7-panel-label"><span>{name(theme)}</span><span>{high?"High contrast":"Standard"}</span></div>
   <div className="v7-panel-content">{children(theme)}</div>
  </div>)}
 </div>;
}
function DemoNote({children}:{children:ReactNode}){return <p className="v7-kit-notes">{children}</p>;}
function TokenPalette({theme,high=false}:{theme:Theme;high?:boolean}){
 const data=tokenSource.raw[theme==="graph"?"day":"night"];
 const resolve=(key:string)=>data[high&&["text.secondary","text.tertiary"].includes(key)?"text.primary":high&&key==="border.default"?"border.strong":key].$value;
 return <div className="v7-token-grid">{selectedTokens.map(key=>{
  const pair=key==="action.bg"||key==="action.hover"||key==="action.pressed"||key==="status.danger-solid"||key==="status.danger-hover"?"text.on-action":
    key.startsWith("surface.")||key.endsWith("subtle")||key.endsWith("muted-hover")?"text.primary":
    key.startsWith("status.")?key+"-subtle":key==="selection.fg"?"selection.subtle":"surface.page";
  const intended=tokenSource.role[key].$extensions["lemma.contrastWith"];
  const pairs=intended.length?intended:[pair];
  return <div className="v7-token-card" key={key}>
    <span className="v7-token-swatch" style={{"--token-color":"var(--v7-role-"+key.replaceAll(".","-")+")"} as CSSProperties}/>
    <div className="v7-token-caption"><b>{key}</b><span>{resolve(key)}</span>
      {pairs.map(bg=><span key={bg}>Contrast {contrast(resolve(key),resolve(bg))}:1 · {bg}</span>)}
    </div>
  </div>;
 })}</div>;
}
function TypeSpecimen(){
 const styles:[string,string,string][]=[
  ["Display · 44/48 (56/60 desktop) · Newsreader","v7-display","The shape of an idea."],
  ["Title · 32/38 (40/46 desktop) · Newsreader","v7-title","Your mathematical journey"],
  ["Headline · 26/32 (30/36 desktop) · Newsreader","v7-headline","Every proof has a beginning"],
  ["Subhead · 20/26 (22/28 desktop) · Newsreader","v7-subhead","A finite subcover"],
  ["Lead · 19/30 · Newsreader","v7-intro","A proof begins with a good question."],
  ["Reading · 17/28 · Newsreader","v7-reading","Let each open neighbourhood contain a useful observation."],
  ["Reading italic · 17/28 · Newsreader","v7-reading v7-reading-italic","A finite choice is enough."],
  ["Body strong · 16/24 · Instrument Sans","v7-body-strong","A new checkpoint"],
  ["Body · 16/24 · Instrument Sans","", "Choose one idea to explore next."],
  ["Label · 14/20 · Instrument Sans","v7-control-label","Session intention"],
  ["Supporting · 14/20 · Instrument Sans","v7-meta","Review this checkpoint when you're ready."],
  ["Caption · 12/16 · Instrument Sans","v7-caption","05 NOV · 09:50"],
  ["Eyebrow · 12/16 · Instrument Sans","v7-eyebrow","Lemma 4.2 · Topology"],
  ["Numeric xl · 64/64 · Instrument Sans","v7-numeric-xl","128"],
  ["Numeric lg · 40/44 · Instrument Sans","v7-numeric-lg","50"],
  ["Numeric md · 28/32 · Instrument Sans","v7-numeric-md","23"],
  ["Code · 14/20 · IBM Plex Mono","v7-code","lemma / v7 / 1.0"]
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
  <div className={"v7-emblem-stage "+subjectClass(subject)}>
   <Emblem subject={subject} seed={"path-"+subject} size={164} animate={false}/>
   <div><p className="v7-eyebrow">Hero · 164 px</p><p className="v7-subhead">{subject}</p>
     <p className="v7-meta">Glyph · 16 px / tile · 48 px / hero · 164 px. The path ID keeps its drawing stable.</p></div>
  </div>
 </div>;
}
function SaveExample(){
 const [state,setState]=useState<"idle"|"saving"|"saved">("idle");
 useEffect(()=>{if(state==="idle")return;const timer=setTimeout(()=>setState(state==="saving"?"saved":"idle"),state==="saving"?600:1200);return()=>clearTimeout(timer);},[state]);
 return <StateButton variant="primary" loading={state==="saving"} saved={state==="saved"} onClick={()=>setState("saving")}>Save changes</StateButton>;
}
function ComponentsPanel(){
 const progressId=useId(),libraryId=useId();
 const [filter,setFilter]=useState(true),[all,setAll]=useState(false),[toggle,setToggle]=useState(true),[duration,setDuration]=useState(45);
 const [menuSheet,setMenuSheet]=useState(false);
 const [selection,setSelection]=useState("Overview"),[tab,setTab]=useState("Cards"),[subject,setSubject]=useState("Analysis");
 return <>
  <div className="v7-compare-group"><h3 className="v7-subhead">Actions and button states</h3>
   <div className="v7-demo-row"><SaveExample/><StateButton>Preview</StateButton>
    <StateButton variant="tertiary">View details</StateButton><StateButton variant="danger">Delete session</StateButton></div>
   <div className="v7-state-grid">
     <div className="v7-state-cell"><small>Rest</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell"><small>Loading</small><StateButton variant="primary" loading>Save changes</StateButton></div>
     <div className="v7-state-cell"><small>Disabled</small><StateButton disabledReason="Finish Checkpoint 3 first.">Continue</StateButton></div>
     <div className="v7-state-cell"><small>Selected</small><ToggleButton selected={toggle} onChange={setToggle}>Pinned</ToggleButton></div>
     <div className="v7-state-cell v7-force-hover"><small>Hover</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell v7-force-press"><small>Pressed</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell v7-force-focus"><small>Focus-visible</small><StateButton>Continue</StateButton></div>
     <div className="v7-state-cell"><small>Read-only</small><p className="v7-meta"><LockKeyhole size={16} aria-hidden="true"/> Value is selectable; editing is locked.</p></div>
     <div className="v7-state-cell"><small>Invalid</small><FormField label="Required" required showError/></div>
   </div>
   <DemoNote>Hover and press use state layers. Focus uses a two-pixel ring, separated by a two-pixel gap. A loading action keeps its variant and width while the label becomes “Saving…”.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Tag · Badge · Filter</h3>
   <div className="v7-demo-row"><Tag subject="Analysis"/><Tag subject="Algebra"/><Tag subject="Topology"/></div>
   <div className="v7-demo-row"><Badge>Info · Saved locally</Badge><Badge tone="success">Success · On track</Badge>
    <Badge tone="warning">Warning · Review due</Badge><Badge tone="danger">Danger · Could not save</Badge></div>
   <div className="v7-demo-row"><FilterChip selected={filter} onChange={setFilter}>Due today</FilterChip>
    <FilterChip selected={all} onChange={setAll}>All cards</FilterChip></div>
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
    <RadioGroup/><CheckChoice/><CheckChoice mixed/><CheckChoice disabledReason="Unavailable · Start the next review first."/>
    <SwitchChoice/><SwitchChoice disabledReason="Unavailable · Enable reminders in settings."/>
    <RangeSlider label="Study length" value={duration} onChange={setDuration} min={5} max={90} unit="min"/>
    <UI.Segmented panelId={progressId} label="Progress views" value={selection} options={["Overview","Learning","Time"]} onChange={setSelection}/>
    <div id={progressId} role="tabpanel" aria-label={selection} className="v7-meta">{selection==="Overview"?"All activity in one place.":selection==="Learning"?"Ideas demonstrated over time.":"Hours focused on mathematics."}</div>
    <UI.Segmented panelId={libraryId} tabs label="Library views" value={tab} options={["Cards","Practice","Atlas"]} onChange={setTab}/>
    <div id={libraryId} role="tabpanel" aria-label={tab} className="v7-meta">{tab==="Cards"?"Cards ready to revisit.":tab==="Practice"?"Practice at your pace.":"Explore mathematical connections."}</div>
    <div className="v7-kit-action-row"><span className="v7-control-label">Daily sessions</span>
      <StepperExample/></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Menus and navigation</h3>
    <UI.Menu label="Open menu" items={[
      {label:"Mark complete",icon:<Check/>,onClick:()=>setSelection("Learning")},
      {label:"Undo changes",icon:<Undo2/>,onClick:()=>setSelection("Overview")},
      {label:"Delete session",icon:<Trash2/>,onClick:()=>setMenuSheet(true)}
    ]}/>
    <UI.Sheet open={menuSheet} onClose={()=>setMenuSheet(false)} title="Delete this example session?" footer={<div className="v7-demo-row"><StateButton onClick={()=>setMenuSheet(false)}>Cancel</StateButton><StateButton variant="confirm" onClick={()=>setMenuSheet(false)}>Delete session</StateButton></div>}><p>This demonstrates a permanent deletion. The example can be reset.</p></UI.Sheet>
    <DemoNote>Menus: Arrow Up/Down to move, Escape to close. Desktop menus accept type-to-jump. The final destructive item is separated and uses Danger.</DemoNote>
  </div>
  <StateMatrix/>
 </>;
}
type SpecimenState="Rest"|"Hover"|"Pressed"|"Selected"|"Focus-visible"|"Disabled"|"Read-only"|"Loading"|"Invalid";
const specimenStates:SpecimenState[]=["Rest","Hover","Pressed","Selected","Focus-visible","Disabled","Read-only","Loading","Invalid"];
function StateMatrix(){
 const families=["Primary button","Secondary button","Tertiary button","Destructive button","Toggle button","Filter chip","Text field","Radio","Checkbox","Switch","Slider","Stepper","Segmented control","Tabs","Select"];
 return <div className="v7-matrix"><h3 className="v7-subhead">Component state reference</h3>
  <p className="v7-meta">Open a component to compare its applicable states. These are visual references; the specimens above accept input.</p>
  {families.map(kind=><details key={kind}><summary>{kind}</summary>
    <div className="v7-doc-pair"><p><b>Anatomy</b> · {kind==="Text field"?"Label → control → helper or error.":kind==="Select"?"Label → value → chevron → options.":kind.includes("button")?"Optional leading icon → verb label → state feedback.":"Label → control → state indicator."}</p>
      <p><b>Do</b> · {kind==="Filter chip"?"Use checks for selected filters.":kind==="Text field"?"Keep labels above values and explain unavailable fields.":"Keep one meaning and one label in every state."}</p>
      <p><b>Avoid</b> · {kind==="Filter chip"?"Using a status badge as a tappable filter.":"Relying on colour alone or changing anatomy between themes."}</p>
      <p><b>Keyboard</b> · {kind==="Text field"?"Tab to focus; select and copy read-only values. Errors are linked to the field.":kind==="Slider"?"Arrows ±5; Page Up/Down ±15; Home/End to bounds.":kind==="Radio"||kind==="Segmented control"||kind==="Tabs"?"Arrows move within the group. The selected item is announced.":"Tab to focus; Space or Enter to activate. The state is announced."}</p>
    </div>
    <div className="v7-state-grid">{specimenStates.map(state=><div key={state} className={"v7-state-cell "+(state==="Hover"?"v7-force-hover":state==="Pressed"?"v7-force-press":state==="Focus-visible"?"v7-force-focus":"")}>
      <small>{state}</small><div inert aria-hidden="true"><StatePreview kind={kind} state={state}/></div>
    </div>)}</div>
  </details>)}
 </div>;
}
function StatePreview({kind,state}:{kind:string;state:SpecimenState}){
 const reason=state==="Disabled"?"Unavailable · Finish Checkpoint 3 first.":undefined;
 const selected=state==="Selected";
 if(["Read-only","Invalid"].includes(state)&&kind!=="Text field"||state==="Loading"&&!["Primary button","Secondary button","Tertiary button","Destructive button"].includes(kind)||selected&&["Primary button","Secondary button","Tertiary button","Destructive button","Text field","Slider","Stepper","Select"].includes(kind))return <span className="v7-meta">Not applicable</span>;
 if(kind==="Toggle button")return <ToggleButton selected={selected} onChange={()=>{}} disabledReason={reason}>Pinned</ToggleButton>;
 if(kind==="Filter chip")return <FilterChip selected={selected} onChange={()=>{}} disabledReason={reason}>Due today</FilterChip>;
 if(kind.endsWith("button"))return <StateButton variant={kind==="Primary button"?"primary":kind==="Tertiary button"?"tertiary":kind==="Destructive button"?"danger":"secondary"} disabledReason={reason} loading={state==="Loading"}>Save changes</StateButton>;
 if(kind==="Text field")return <FormField label="Checkpoint" initial={state==="Invalid"?"":"Compactness"} readOnly={state==="Read-only"} required={state==="Invalid"} showError={state==="Invalid"} disabledReason={reason}/>;
 if(kind==="Radio")return <label className="v7-radio-choice"><input type="radio" checked={selected} readOnly disabled={!!reason}/>Review</label>;
 if(kind==="Checkbox")return <label className="v7-check-choice"><input type="checkbox" checked={selected} readOnly disabled={!!reason}/>Review cards</label>;
 if(kind==="Switch")return <label className="v7-switch-choice"><span>Reminders</span><input type="checkbox" role="switch" checked={selected} readOnly disabled={!!reason}/><span className="v7-switch-visual"><span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d={selected?"m5 10 3 3 7-7":"M5 10h10"}/></svg></span></span></label>;
 if(kind==="Slider")return <RangeSlider label="Duration" value={45} min={5} max={90} unit="min" onChange={()=>{}} disabledReason={reason}/>;
 if(kind==="Stepper")return <UI.Stepper label="Sessions" value={reason?0:3} min={0} max={reason?0:5} onChange={()=>{}}/>;
 if(kind==="Select")return <><UI.Picker label="Subject" value="Analysis" options={["Analysis","Algebra"]} onChange={()=>{}} disabled={!!reason}/>{reason&&<span className="v7-disabled-reason">{reason}</span>}</>;
 return <UI.Segmented tabs={kind==="Tabs"} label={kind} value={selected?"Cards":"Atlas"} options={["Cards","Atlas"]} onChange={()=>{}} disabled={!!reason}/>;
}
function StepperExample(){const [value,setValue]=useState(3);return <UI.Stepper label="Daily sessions" value={value} onChange={setValue} min={0} max={5}/>;}
function PatternPanel(){
 const [sheet,setSheet]=useState(false),[toast,setToast]=useState(false),[retry,setRetry]=useState(false);
 return <>
  <div className="v7-hero-specimen v7-subject-1">
   <SubjectMark subject="Analysis" size="hero"/>
   <div className="v7-demo-row"><Tag subject="Analysis"/><ProofBadge state="progress"/></div>
   <h3 className="v7-title">Make space for a proof.</h3>
   <p className="v7-reading">A clear intention makes the next session easier to begin.</p>
   <p className="v7-meta">50 min · Checkpoint 4 of 7</p>
   <div><StateButton variant="primary">Start session</StateButton></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Proof states</h3>
    <div className="v7-demo-row">{(["conjecture","progress","demonstrated","review"] as const).map(s=><ProofBadge key={s} state={s}/>)}</div>
    <CompletionPattern/>
    <DemoNote>∎ means the end of a demonstrated proof. A star fills only after its checkpoint is demonstrated. Reduced motion shows the final state immediately.</DemoNote>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Statement cards</h3>
   <StatementCard kind="Theorem" demonstrated/><StatementCard kind="Definition"/><StatementCard kind="Lemma" demonstrated/><StatementCard kind="Example"/><StatementCard kind="Exercise" number="4.3"/><StatementCard kind="Proof" demonstrated/>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Paths and rows</h3><PathRow subject="Analysis" title="Continuity and limits"/><PathRow subject="Topology" title="Compact spaces" demonstrated/></div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Measures</h3>
    <div className="v7-columns"><StatMeasure label="Focused today" value="50" unit="min" change="▲ +25 min vs yesterday"/>
      <StatMeasure label="Cards reviewed" value="23" unit="cards"/></div>
    <MasteryBar subject="Analysis" value={65}/><MasteryBar subject="Algebra" value={40}/>
    <MasteryBar subject="Topology" value={100}/><MasteryBar subject="Probability" value={0}/>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Feedback and decisions</h3>
    <FeedbackBanner tone="info" action="Retry now" onAction={()=>setRetry(true)}>{retry?"Info · Connection restored. Changes are saved.":"Offline · Changes are saved on this device. Retrying the sync in 10 s."}</FeedbackBanner>
    <FeedbackBanner tone="danger" action="Retry now" onAction={()=>setRetry(true)}>Danger · Couldn't save. Check your connection, then retry.</FeedbackBanner>
    <div className="v7-demo-row"><button className="v7-demo-trigger" type="button" onClick={()=>setToast(!toast)}>
      {toast?"Dismiss toast":"Show undo toast"}</button>
      <button className="v7-demo-trigger" type="button" onClick={()=>setSheet(true)}>Open delete confirmation</button></div>
    <UI.Toast preview message="Session removed" action="Undo" onClose={()=>setToast(false)}/>
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
    series={[{label:"Recall",color:"var(--v7-role-viz-heat4)"}]} format={n=>Math.round(n)+"%"}/></div>
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
 const [theme,setTheme]=useState<"Day"|"Night">(()=>{
   try {const saved=localStorage.getItem("lemma.v7Kit.theme");if(saved==="Day"||saved==="Night")return saved;}catch{/* storage is optional */}
   return document.documentElement.dataset.theme==="graph-night"?"Night":"Day";
 });
 const [high,setHigh]=useState(false),[density,setDensity]=useState("comfortable");
 useEffect(()=>{document.documentElement.dataset.theme=theme==="Night"?"graph-night":"graph";},[theme]);
 useEffect(()=>{const root=document.documentElement;root.dataset.contrast=high?"high":"standard";root.dataset.density=density;return()=>{delete root.dataset.contrast;delete root.dataset.density;};},[high,density]);
 return <main className="v7-kit" id="main-content">
  <header className="v7-kit-header">
   <div className="v7-between"><p className="v7-eyebrow">Lemma · Constellation</p><span className="v7-kit-version">UI Kit / 1.0.1</span></div>
   <h1 className="v7-display">A little more clarity.</h1>
   <p className="v7-intro">Notebook by day. Observatory by night. One mathematical language for everything you learn.</p>
   <UI.Segmented label="Theme" options={["Day","Night"]} value={theme}
     onChange={t=>{setTheme(t as "Day"|"Night");document.documentElement.dataset.theme=t==="Night"?"graph-night":"graph";
      try {localStorage.setItem("lemma.v7Kit.theme",t);}catch{ /* storage is optional */ }
     }}/> 
   <label className="v7-check-choice"><input type="checkbox" checked={high} onChange={e=>setHigh(e.target.checked)}/>High contrast comparison</label>
   <label className="v7-density-label">Density<select value={density} onChange={event=>setDensity(event.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
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
    <Compare high={high} density={density}>{theme=><>
      <h3 className="v7-subhead">Role colours · live contrast</h3><TokenPalette theme={theme} high={high}/>
      <h3 className="v7-subhead">Type roles</h3><TypeSpecimen/>
      <h3 className="v7-subhead">Space · shape · elevation</h3>
      <div className="v7-token-measures">{[4,8,12,16,20,24,32,40,48,64,80].map(value=><span key={value}>{value} px</span>)}</div>
      <div className="v7-demo-row"><Tag subject="Analysis"/><Badge>Badge 8 px</Badge><div className="v7-surface-sample">Raised · 16 px</div></div>
      <p className="v7-meta">Motion: 80 · 120 · 200 · 320 · 600 · 900 ms. Reduced motion removes travel and shimmer.</p>
      <div className="v7-demo-row">{[["xs",80],["sm",120],["md",200],["lg",320],["xl",600],["emblem",900]].map(([role,ms])=><button key={role} type="button" className="v7-demo-trigger" style={{"--v7-motion-duration":ms+"ms"} as CSSProperties} onClick={event=>{const target=event.currentTarget;target.classList.remove("v7-motion-play");requestAnimationFrame(()=>requestAnimationFrame(()=>target.classList.add("v7-motion-play")));}}>Play {role} · {ms} ms</button>)}</div>
    </>}</Compare>
  </Section>
  <Section number="03" title="Icons and mathematical emblems" description="Nine subjects, stable constructions, three levels of detail. Glyphs are simplified drawings; mathematical symbols use the math font.">
    <Compare high={high} density={density}>{()=> <EmblemsPanel/>}</Compare>
  </Section>
  <Section number="04" title="Components and states" description="One interaction model: rest, hover, pressed, selected, focus, disabled, read-only, loading and invalid.">
    <Compare high={high} density={density}>{()=> <ComponentsPanel/>}</Compare>
    <DemoNote>Keyboard: Tab to move; arrows within radios and tabs; Space or Enter to activate; Escape to close menus and sheets. Read-only values are selectable. All controls have accessible names.</DemoNote>
  </Section>
  <Section number="05" title="Patterns" description="Single-step heroes, proof-first cards, Constellation progress and feedback that explains the next move.">
    <Compare high={high} density={density}>{()=> <PatternPanel/>}</Compare>
  </Section>
  <Section number="06" title="Data visualisation" description="Subject-coded marks, round axes, ink/starlight heatmaps, keyboard details and a data table for each chart.">
    <Compare high={high} density={density}>{()=> <ChartsPanel/>}</Compare>
  </Section>
  <Section number="07" title="Changelog" description="Versioned guidance for implementing this system consistently across Lemma.">
    <div className="v7-change-card"><span className="v7-kit-version">1.0.1 · Constellation</span>
      <h3 className="v7-subhead">Notebook and Observatory</h3>
      <p>Corrected the shared style cascade, subject glyphs and generated tiles, loading widths, independent theme controls, statement variants, checkpoint completion, and full-width data graphics. Foundations and all three variable tiers now export from the token source.</p>
      <p className="v7-meta">The v7 feature flag remains off until the Owner approves the gallery, six golden screens, responsive layouts and device accessibility checks.</p>
    </div>
  </Section>
 </main>;
}

