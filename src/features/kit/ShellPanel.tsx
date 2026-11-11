import {CalendarDays,ChartColumn,House,Layers,Plus,Route,Search,Inbox,Timer} from "lucide-react";
import {Emblem} from "../../ui/v7/Emblem";
import {SubjectMark,Tag,subjectClass,subjects,type Subject} from "../../ui/v7/KitPrimitives";
import {LiveChip,StatusBadge} from "../../ui/v7/Status";
import {StarMark} from "../atlas/v7/AtlasV7";
import {stateLabel,type StarState} from "../atlas/v7/model";
import "../../app/v7/shell.css";
import "../calendar/v7/calendar.css";
import "../home/v7/today.css";
import "../focus/v7/focus.css";
import "../review-run/v7/review.css";
import "../atlas/v7/atlas.css";

const stars:StarState[]=["demonstrated","in_progress","up_next","revisit","not_started"];
const tabs=[[House,"Today"],[Route,"Paths"],[Layers,"Review"],[CalendarDays,"Calendar"],[ChartColumn,"Progress"]] as const;
const RING=140,RADIUS=60,CIRC=2*Math.PI*RADIUS;

/** KA5–KA8 (Night critique v2): the app shell and screen-level pieces the kit did not specify, drawn with the real classes so
 *  the gallery and the app cannot drift. Static specimens: nothing here navigates or writes. */
export default function ShellPanel(){
 return <>
  <div className="v7-compare-group"><h3 className="v7-subhead">Tab bar and Capture</h3>
   <p className="v7-meta">Solid <code>surface.overlay</code> with a <code>border.subtle</code> edge and the level 2 shadow; the active tab is a <code>selection.subtle</code> pill; a count pip sits on Review. Capture is an overlay-surface button, never indigo, and slides away while scrolling down.</p>
   <div className="v7-shell-specimen"><div className="v7-dock v7-dock-static"><nav aria-label="Tab bar specimen" className="v7-tabbar" style={{"--v7-tab-index":0} as React.CSSProperties}>
    <span className="v7-tab-pill" aria-hidden="true"/>
    {tabs.map(([Icon,label],index)=><span key={label} className="v7-tab" aria-current={index===0?"page":undefined}>
     <span className="v7-tab-icon"><Icon aria-hidden="true"/>{label==="Review"&&<span className="v7-tab-pip">23</span>}</span><span>{label}</span></span>)}
   </nav></div>
   <span className="v7-capture v7-capture-static" aria-label="Capture specimen"><Plus aria-hidden="true"/></span></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Hub header</h3>
   <p className="v7-meta">Title 32 on the left, actions on the right, in a sticky solid bar. After 24 px of scrolling the title becomes Subhead 20. Today alone uses Display 44 under a date row.</p>
   <header className="v7-hub-bar v7-hub-bar-static" data-collapsed="false"><div className="v7-hub-row"><span className="v7-hub-title">Review</span>
    <span className="v7-page-actions"><span aria-hidden="true"><Search/></span><span aria-hidden="true"><Inbox/></span></span></div></header>
   <header className="v7-hub-bar v7-hub-bar-static" data-collapsed="true"><div className="v7-hub-row"><span className="v7-hub-title">Review</span>
    <span className="v7-page-actions"><span aria-hidden="true"><Search/></span><span aria-hidden="true"><Inbox/></span></span></div></header>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Week strip</h3>
   <p className="v7-meta">Seven days, subject glyphs under each date, the selected day in the selection pair and today in a 1.5 px <code>text.primary</code> ring.</p>
   <div className="v7-cal-strip" role="presentation">{["M","T","W","T","F","S","S"].map((letter,index)=>
    <span key={index} className="v7-cal-cell" data-today={index===0?"true":"false"} aria-pressed={index===2}><small>{letter}</small><span>{9+index}</span>
     <i>{index===0&&<SubjectMark subject="Analysis"/>}{index===2&&<><SubjectMark subject="Algebra"/><SubjectMark subject="Topology"/></>}</i></span>)}</div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Time-grid block and suggested block</h3>
   <p className="v7-meta">A block carries a 3 px inner rule inset by its padding with round ends — never a side stripe on a rounded box. A suggestion is the subject tint at low strength with a solid 1 px edge and an info Badge; dashed borders stay reserved for drop zones.</p>
   <div className="v7-shell-grid">
    <div className={"v7-cal-block "+subjectClass("Analysis")} data-size="full" style={{position:"static",height:64}}><div><strong>Solve analysis problems</strong><small>15:00–15:50</small><small>Real Analysis</small></div></div>
    <div className={"v7-cal-block v7-cal-suggested "+subjectClass("Algebra")} style={{position:"static",height:40}}><div><span className="v7-cal-suggested-line"><StatusBadge tone="info" className="v7-cal-suggested-badge">Suggested</StatusBadge><strong>Read topology notes</strong></span></div></div>
   </div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Day strip and live chip</h3>
   <p className="v7-meta">The strip covers the owner's planning window. A live time chip is an info Badge with a clock icon.</p>
   <span className="v7-today-strip" aria-hidden="true"><span className={"v7-today-strip-block "+subjectClass("Analysis")} style={{left:"52%",width:"12%"}}/><span className="v7-today-now" style={{left:"38%"}}/></span>
   <div className="v7-demo-row"><LiveChip>in 1 h 17 min</LiveChip><LiveChip>Now · until 16:30</LiveChip></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Focus timer</h3>
   <p className="v7-meta">A 6 px ring in the subject colour with a round head, the eyebrow, the numeral (Numeric xl) and the intention as one block.</p>
   <div className={"v7-focus-ring v7-shell-timer "+subjectClass("Analysis")} data-word="Focus" style={{width:RING,height:RING}}>
    <svg viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true"><circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-track"/>
     <circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-arc" strokeDasharray={CIRC} strokeDashoffset={CIRC*.35} transform={`rotate(-90 ${RING/2} ${RING/2})`}/></svg>
    <div className="v7-focus-readout"><p className="v7-eyebrow">Focus</p><span className="v7-focus-time v7-shell-time"><Timer aria-hidden="true" className="v7-shell-timer-icon"/>32:10</span></div></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Review grade dock</h3>
   <p className="v7-meta">Four named grades with the next interval under each; the primary is one 48 px button before the answer is shown.</p>
   <div className="v7-review-grades v7-shell-grades" role="presentation">{[["Again","10 min"],["Hard","1 day"],["Good","4 days"],["Easy","9 days"]].map(([label,next])=>
    <span key={label} data-grade={label.toLowerCase()}><span>{label}</span><small>{next}</small></span>)}</div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Map stars</h3>
   <p className="v7-meta">The same proof-state marks as everywhere else: a subject-filled star is demonstrated, ◐ in progress, ☆ up next, ↻ review due and a hollow ○ a conjecture.</p>
   <ul className="v7-shell-stars">{stars.map(state=><li key={state}><StarMark state={state} subjectClassName={subjectClass("Analysis")}/><span>{stateLabel[state]}</span></li>)}</ul>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Search row</h3>
   <p className="v7-meta">Search is a full-height sheet whose field is its header. Rows have their own icon and the match in bold.</p>
   <div className="v7-search-row v7-shell-search" data-active="true"><Timer aria-hidden="true"/><span>Quick focus</span><small>Action</small></div>
   <div className="v7-search-row v7-shell-search" data-active="false"><Layers aria-hidden="true"/><span><mark>Comp</mark><span data-rest="">actness</span></span><small>Real Analysis</small></div>
  </div>
  <div className="v7-compare-group"><h3 className="v7-subhead">Cover size</h3>
   <p className="v7-meta">Between a 48 px tile and a 164 px hero: a 96 px cover on the subject tint with tile-level detail (at most 24 strokes at 1 px).</p>
   <div className="v7-shell-covers">{(["Analysis","Algebra","Topology"] as Subject[]).map(subject=>
    <span key={subject} className={"v7-today-tile-cover "+subjectClass(subject)} style={{width:120}}><Emblem subject={subject} seed={"cover-"+subject} size={96} animate={false}/></span>)}</div>
   <div className="v7-demo-row">{subjects.slice(0,3).map(subject=><Tag key={subject} subject={subject}/>)}</div>
  </div>
 </>;
}
