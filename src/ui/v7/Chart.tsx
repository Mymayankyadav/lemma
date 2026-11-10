import {useId, useState} from 'react';
import './chart.css';
import {bounded} from '../charts/types';
import {formatDay} from '../../lib/format';

export interface ChartDatum {label:string; values:number[]}
export interface ChartSeries {label:string; color?:string}
export interface ChartProps {title:string; data:ChartDatum[]; series:ChartSeries[]; kind?:'line'|'bars'|'stacked'|'heatmap'; area?:boolean; target?:number; format?:(value:number)=>string}

/** A single-scale graphic with keyboard/touch details and an equivalent data table. */
export function Chart({title,data,series,kind='bars',area=false,target,format=String}:ChartProps) {
 const [table,setTable]=useState(false), [selected,setSelected]=useState<number|null>(null), id=useId();
 const values=data.flatMap(d=>d.values).filter(Number.isFinite);
 const observed=Math.max(1,target??0,...(kind==='stacked'?data.map(d=>d.values.reduce((a,b)=>a+Math.max(0,b),0)):values));
 const percentage=/%/.test(format(100))||/recall|percent/i.test(title);
 const scale=10**Math.floor(Math.log10(observed));
 const nice=[1,2,2.5,5,10].find(v=>v*scale>=observed)??10;
 const maximum=percentage?100:nice*scale;
 const total=data.reduce((sum,d)=>sum+d.values.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0),0);
 const peak=data.length?data.reduce((best,d)=>d.values.reduce((a,b)=>a+b,0)>data[best].values.reduce((a,b)=>a+b,0)?data.indexOf(d):best,0):0;
 const summary=data.length?`You recorded ${format(total)} across ${data.length} entries; the highest is ${data[peak]?.label}.`:"There are no values in this range yet.";
 const width=Math.max(280,data.length*30+44), height=160, left=32, bottom=130, top=24, plotHeight=bottom-top;
 const group=(width-left-8)/Math.max(1,data.length), bar=Math.min(24,group*.55), point=(i:number)=>left+group*(i+.5);
 const y=(value:number)=>bottom-Math.max(0,value)/maximum*plotHeight;
 const color=(index:number)=>series[index]?.color??`var(--v7-role-subject-${['analysis','algebra','topology','number-theory','geometry','logic','probability','combinatorics'][index%8]})`;
 const maxIndex=peak;
 const selectedRow=selected===null?null:data[selected];
 return <section className="v7-chart" aria-labelledby={id}>
  <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={()=>setTable(!table)}>{table?'Show chart':'Show as table'}</button></div>
  <p className="v7-chart-summary">{summary}</p>
  {(series.length>1||!!series[0]?.color)&&<ul className="v7-chart-legend">{series.map((s,i)=><li key={s.label}><span aria-hidden="true" style={{background:color(i)}}/>{s.label}</li>)}</ul>}
  {table?<div className="v7-chart-scroll"><table><thead><tr><th scope="col">Date</th>{series.map(s=><th scope="col" key={s.label}>{s.label}</th>)}</tr></thead><tbody>{data.map((row,i)=><tr key={`${row.label}-${i}`}><th scope="row">{row.label}</th>{series.map((s,j)=><td key={s.label}>{Number.isFinite(row.values[j])?format(row.values[j]):'—'}</td>)}</tr>)}</tbody></table></div>:
  <div className="v7-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title} style={{minWidth:width}}>
   {[0,.5,1].map(v=><g key={v}><line x1={left} x2={width-8} y1={y(v*maximum)} y2={y(v*maximum)} className="v7-chart-grid"/><text x={left-4} y={y(v*maximum)+4} textAnchor="end" className="v7-chart-text">{format(v*maximum)}</text></g>)}
   {target!==undefined&&target>=0&&target<=maximum&&<g><line x1={left} x2={width-8} y1={y(target)} y2={y(target)} className="v7-chart-grid"/><text x={width-8} y={y(target)-4} textAnchor="end" className="v7-chart-text">target {format(target)}</text></g>}
   {kind==='line'&&area&&series.map((s,j)=><polygon key={s.label} fill={color(j)} opacity=".1" points={`${point(0)},${bottom} ${data.map((row,i)=>`${point(i)},${y(row.values[j]??0)}`).join(' ')} ${point(Math.max(0,data.length-1))},${bottom}`}/>)}
   {kind==='line'&&series.map((s,j)=><polyline key={s.label} fill="none" stroke={color(j)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((row,i)=>`${point(i)},${y(row.values[j]??0)}`).join(' ')}/>)}
   {data.map((row,i)=>{let accumulated=0;return <g key={`${row.label}-${i}`} role="button" tabIndex={0} aria-label={`${row.label}: ${row.values.map((v,j)=>`${series[j]?.label??''} ${format(v)}`).join(', ')}`} onClick={()=>setSelected(i)} onMouseEnter={()=>setSelected(i)} onFocus={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const items=Array.from(e.currentTarget.parentElement?.querySelectorAll('[role="button"]')??[]);const next=i+(e.key==='ArrowRight'?1:-1);if(next>=0&&next<items.length){(items[next] as SVGElement).focus();setSelected(next);}}if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i);}}}>
    {kind==='line'?row.values.map((v,j)=><circle key={j} cx={point(i)} cy={y(v)} r="3" fill={color(j)} stroke="var(--v7-bg-raised)" strokeWidth="2"/>):kind==='heatmap'?<rect x={point(i)-bar/2} y={bottom-24} width={bar} height="24" rx="3" fill="var(--v7-accent-fill)" opacity={Math.max(.08,bounded((row.values[0]??0)/maximum))}/>:row.values.map((v,j)=>{const start=accumulated;accumulated+=Math.max(0,v);const topY=kind==='stacked'?y(accumulated):y(v),heightY=kind==='stacked'?Math.max(0,y(start)-topY-2):bottom-topY;const x=point(i)-bar/2+(kind==='bars'?j*bar/Math.max(1,series.length):0),w=kind==='bars'?bar/Math.max(1,series.length):bar,r=(kind==='stacked'&&j!==row.values.length-1)?0:Math.min(4,w/2,heightY/2);return <path key={j} d={`M${x} ${topY+heightY}V${topY+r}Q${x} ${topY} ${x+r} ${topY}H${x+w-r}Q${x+w} ${topY} ${x+w} ${topY+r}V${topY+heightY}Z`} fill={color(j)}/>;})}
    {(kind!=='line'||i===data.length-1)&&<text x={point(i)} y={Math.max(12,y(kind==='stacked'?accumulated:Math.max(...row.values,0))-5)} textAnchor="middle" className="v7-chart-text">{format(kind==='stacked'?accumulated:Math.max(...row.values,0))}</text>}
    <rect x={point(i)-group/2} y={top} width={group} height={plotHeight} fill="transparent"/>
    <text x={point(i)} y={height-6} textAnchor="middle" className="v7-chart-text">{row.label}</text>
   </g>})}
  </svg></div>}
  {selectedRow&&!table&&<p className="v7-chart-tooltip" role="status">{selectedRow.values.map((v,i)=>`${format(v)} ${series[i]?.label??''}`).join(' · ')} · {selectedRow.label}</p>}
  {!data.length&&<p className="v7-meta">No data in this range yet.</p>}
 </section>;
}

/** Ranked values remain available to keyboard and assistive technology as text. */
export function HorizontalBars({title,data,format=String}:{title:string;data:{label:string;value:number;color?:string}[];format?:(value:number)=>string}){
 const id=useId(),[table,setTable]=useState(false),[selected,setSelected]=useState<number|null>(null);
 const max=Math.max(1,...data.map(d=>d.value));
 const total=data.reduce((acc,d)=>acc+(Number.isFinite(d.value)?d.value:0),0);
 return <section className="v7-chart" aria-labelledby={id}>
  <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={()=>setTable(!table)}>{table?'Show chart':'Show as table'}</button></div>
  <p className="v7-chart-summary">Time by subject is scaled to the highest value, {format(max)}.</p>
  {table?<table><thead><tr><th scope="col">Subject</th><th scope="col">Value</th></tr></thead><tbody>{data.map(d=><tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody></table>:
   <ul className="v7-horizontal-bars">{data.map((d,i)=><li key={d.label}><button type="button" onClick={()=>setSelected(i)} onFocus={()=>setSelected(i)} onMouseEnter={()=>setSelected(i)}><span>{d.label}</span><span className="v7-horizontal-track"><span style={{width:`${bounded(d.value/max)*100}%`,background:d.color??'var(--v7-role-subject-analysis)'}}/></span><span>{format(d.value)}</span></button></li>)}</ul>}
  {selected!==null&&data[selected]&&!table&&<p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {data[selected].label}</p>}
 </section>;
}

function displayHeatmapDate(value:string):string {return /^\d{4}-\d{2}-\d{2}$/.test(value)?formatDay(value):value;}

/** Weeks are columns, days are rows; each cell supplies its own date and value. */
export function Heatmap({title,data,format=String}:{title:string;data:{date:string;value:number}[];format?:(value:number)=>string}){
 const id=useId(),[table,setTable]=useState(false),[selected,setSelected]=useState<number|null>(null);
 const total=data.reduce((sum,d)=>sum+(Number.isFinite(d.value)?d.value:0),0);
 return <section className="v7-chart" aria-labelledby={id}>
  <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={()=>setTable(!table)}>{table?'Show chart':'Show as table'}</button></div>
  <p className="v7-chart-summary">You recorded {format(total)} across {data.length} days. Dark ink in Day and bright starlight in Night show higher activity.</p>
  {table?<div className="v7-chart-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Value</th></tr></thead><tbody>{data.map(d=><tr key={d.date}><th scope="row">{displayHeatmapDate(d.date)}</th><td>{format(d.value)}</td></tr>)}</tbody></table></div>:
   <><div className="v7-heat-swatches" aria-label="Heatmap legend">
   {["0","1–15","16–30","31–60","60+ min"].map((label,i)=><span key={label}><i style={{background:i===0?"transparent":"var(--v7-role-viz-heat"+i+")"}}/>{label}</span>)}
   </div><div className="v7-chart-scroll"><div className="v7-heatmap-frame"><div className="v7-heatmap-months">{Array.from({length:Math.ceil(data.length/7)},(_,week)=>{const d=data[week*7]?.date;const prior=week?data[(week-1)*7]?.date:undefined;const month=d?.slice(0,7);return <span key={week}>{/^\d{4}-\d{2}-\d{2}$/.test(d??'')&&month!==prior?.slice(0,7)?new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`)):''}</span>;})}</div><div className="v7-heatmap-days" aria-hidden="true"><span>M</span><span>W</span><span>F</span></div><div className="v7-heatmap" role="group" aria-label={title}>{data.map((d,i)=><button type="button" key={d.date} aria-label={`${displayHeatmapDate(d.date)}: ${format(d.value)}`} onClick={()=>setSelected(i)} onFocus={()=>setSelected(i)} onMouseEnter={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const step=e.key==='ArrowRight'?7:e.key==='ArrowLeft'?-7:e.key==='ArrowDown'?1:-1;const btn=e.currentTarget.parentElement?.querySelectorAll('button')[i+step];btn?.focus();setSelected(Math.max(0,Math.min(data.length-1,i+step)));}}}><svg aria-hidden="true" viewBox="0 0 12 12"><rect width="12" height="12" rx="3" fill={d.value<=0?"transparent":"var(--v7-role-viz-heat"+(d.value<=15?1:d.value<=30?2:d.value<=60?3:4)+")"} stroke={d.value<=0?"var(--v7-role-border-subtle)":"none"}/></svg></button>)}</div></div></div></>}
  {selected!==null&&data[selected]&&!table&&<p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {displayHeatmapDate(data[selected].date)}</p>}
  {!data.length&&<p className="v7-meta">No data in this range yet.</p>}
 </section>;
}
