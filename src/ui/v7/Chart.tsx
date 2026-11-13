import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { bounded } from "../charts/types";
import { formatDay } from "../../lib/format";
import { SubjectMark, subjects, type Subject } from "./KitPrimitives";
import "./chart.css";

export interface ChartDatum { label: string; tickLabel?: string; values: number[] }
export interface ChartSeries { label: string; color?: string; subject?: Subject }
export interface ChartProps { title: string; data: ChartDatum[]; series: ChartSeries[]; kind?: "line" | "bars" | "stacked" | "heatmap"; area?: boolean; target?: number; format?: (value: number) => string; summary?: string; compact?: boolean;
  /** V34 (v7 UX audit r3): the exact format for the summary sentence (axis ticks round to "1.6 h"; the sentence says "1 h 35 min"). */
  totalFormat?: (value: number) => string }
const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const sum = (values: number[]) => values.reduce((total, value) => total + finite(value), 0);
const subjectFor = (label: string): Subject | undefined => subjects.find(subject => subject === label);
function movePoint(event: KeyboardEvent<SVGElement | HTMLButtonElement>, index: number, count: number, step = 1) {
  const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (!delta && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, index + delta));
  event.currentTarget.closest("svg,ul,.v7-heatmap")?.querySelectorAll<SVGElement | HTMLButtonElement>("[data-chart-point]")[next]?.focus();
}
/** One graphic and one equivalent table share the same data and summary. */
/** Approximate width of a caption-size label in plot units (the plot is drawn in a 360-unit viewBox). */
export const labelWidth = (text: string) => text.length * 6.4;
/**
 * R0 · F06: which x tick labels to print. Labels are thinned by the room each one has (at least an 8-unit gap); a data
 * point may mark a preferred tick (a week or month start) by giving `tickLabel`, and those win when thinning.
 */
export function visibleTicks(labels: string[], group: number, preferred: boolean[] = labels.map(() => true), gap = 8): boolean[] {
  const widest = Math.max(0, ...labels.map(labelWidth));
  const every = Math.max(1, Math.ceil((widest + gap) / Math.max(1, group)));
  const anyPreferred = preferred.some(Boolean) && preferred.some(value => !value);
  const out = labels.map(() => false);
  let last = -Infinity;
  labels.forEach((label, index) => {
    if (!label || (anyPreferred && !preferred[index])) return;
    if (index - last >= every) { out[index] = true; last = index; }
  });
  return out;
}
/**
 * N157 · V08 (v7 UX audit r3): the plot is drawn in as many units as it has CSS pixels (between 280 and 640), so its
 * text stays at the chart's 12 px caption size and its lines at their weight at every width; before, a 360-unit
 * drawing was stretched (axis text 19 px on a 460 px chart, 38 px on a 936 px one). 360 until measured (tests, SSR).
 */
export const PLOT_MIN = 280, PLOT_MAX = 640;
export const plotWidth = (measured: number) => measured > 0 ? Math.round(Math.min(PLOT_MAX, Math.max(PLOT_MIN, measured))) : 360;
function usePlotWidth() {
  const ref = useRef<HTMLElement>(null), [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(plotWidth(node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
export function Chart({ title, data, series, kind = "bars", area = false, target, format = String, summary: suppliedSummary, compact = false, totalFormat = format }: ChartProps) {
  const [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null), id = useId();
  const [measureRef, width] = usePlotWidth();
  const percentage = /%/.test(format(100));
  const observed = Math.max(1, target ?? 0, ...(kind === "stacked" ? data.map(row => sum(row.values)) : data.flatMap(row => row.values).map(finite)));
  const scale = 10 ** Math.floor(Math.log10(observed));
  // KC5: ticks on round numbers (1, 2, 2.5 or 5 × 10ⁿ), at most four steps, and the top tick is the first round step above the data.
  const step = percentage ? 25 : ([1, 2, 2.5, 5, 10].map(value => value * scale).find(value => observed / value <= 4) ?? 10 * scale);
  const maximum = percentage ? 100 : Math.max(step, Math.ceil(observed / step) * step);
  const ticks = Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => index * step);
  const total = data.reduce((value, row) => value + sum(row.values), 0);
  const peak = data.reduce((best, row, index) => sum(row.values) > sum(data[best].values) ? index : best, 0);
  const summary = suppliedSummary ?? (!data.length ? "No data in this range yet." : percentage ?
    `${title} reached ${format(data[data.length - 1].values[0])} on ${data[data.length - 1].label}, from ${format(data[0].values[0])} on ${data[0].label}.` :
    // F43: per-metric wording. Time totals read "You studied 3 h 55 min"; counts read "413 reviews in this range".
    // IL5: no "most on …" when nothing was studied.
    /\b(h|min)\b/.test(format(total)) ? (total <= 0 ? "Nothing studied in this range yet." : `You studied ${totalFormat(total)} in this range, most on ${data[peak].label}.`) :
    `${format(total)} ${title.toLowerCase().replace(/ (by|over|per) .*$/, "")} in this range, most on ${data[peak].label}.`);
  // N125: the axis gutter fits its widest tick label ("40 min" was clipped to "0 min" in a fixed 40-unit gutter).
  const left = Math.max(40, Math.ceil(Math.max(...ticks.map(tick => labelWidth(format(tick)))) * 1.15) + 12);
  const height = compact ? 150 : 224, bottom = compact ? 116 : 180, top = compact ? 20 : 36, plotHeight = bottom - top;
  const direct=series.length>1&&series.length<=3;
  // F06: a target line is labelled at the right edge, outside the data, so it never overprints a value.
  const targetShown = target !== undefined && target >= 0 && target <= maximum;
  const plotRight=width-(direct?102:targetShown?52:24);
  const group = (plotRight - left) / Math.max(1, data.length), bar = group * .5;
  const point = (index: number) => left + group * (index + .5);
  const ticksShown = visibleTicks(data.map(row => row.tickLabel ?? row.label), group, data.some(row => row.tickLabel !== undefined) ? data.map(row => !!row.tickLabel) : undefined);
  const y = (value: number) => bottom - Math.min(maximum, finite(value)) / maximum * plotHeight;
  // KC3/KC4: subject colour means a subject. A series that is not a subject takes the neutral data colour, never indigo.
  const color = (index: number) => {
    const item = series[index], subject = item?.subject ?? subjectFor(item?.label ?? "");
    if (item?.color) return item.color;
    if (subject === 'Other') return 'var(--v7-role-viz-neutral)';
    if (subject) return `var(--v7-role-subject-${subject.toLowerCase().replace(" ", "-")})`;
    return series.length === 1 ? "var(--v7-role-viz-neutral)" : `var(--v7-role-subject-${["analysis", "algebra", "topology", "number-theory", "geometry", "logic", "probability", "combinatorics"][index % 8]})`;
  };
  const selectedRow = selected === null ? null : data[selected];
  const labels=direct?series.map((item,j)=>{
    let index=data.length-1;
    while(index>0&&finite(data[index].values[j]??0)===0)index--;
    const row=data[index];
    const middle=kind==='stacked'&&row?sum(row.values.slice(0,j))+finite(row.values[j]??0)/2:row?.values[j]??0;
    return {item,j,index:Math.max(0,index),actual:y(middle),labelY:y(middle)};
  }).sort((a,b)=>a.actual-b.actual):[];
  labels.forEach((label,i)=>{label.labelY=Math.max(top+10,label.actual,i?labels[i-1].labelY+24:top+10);});
  if(labels.length&&labels[labels.length-1].labelY>bottom-8){
    labels[labels.length-1].labelY=bottom-8;
    for(let i=labels.length-2;i>=0;i--)labels[i].labelY=Math.min(labels[i].labelY,labels[i+1].labelY-24);
  }
  return <section ref={measureRef} className="v7-chart" data-chart="plot" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">{summary}</p>
    {!!data.length && series.length > 3 && <ul className="v7-chart-legend" data-mark={kind === "line" ? "line" : "bar"}>{series.map((seriesItem, index) => {
      const subject = seriesItem.subject ?? subjectFor(seriesItem.label);
      return <li key={seriesItem.label}>{subject && <SubjectMark subject={subject} />}<span>{seriesItem.label}</span><i style={{ background: color(index) }} aria-hidden="true" /></li>;
    })}</ul>}
    {/* F04/F46: the selection readout is pinned above the plot, so it never lands under a bar or a sticky bar. */}
    {selectedRow && !table && <p className="v7-chart-tooltip" role="status">{selectedRow.values.map((value, index) => `${format(value)} ${series[index]?.label ?? ""}`).join(" · ")} · {selectedRow.label}</p>}
    {table ? <div className="v7-chart-scroll"><table><caption className="v7-sr-only">{title}</caption><thead><tr><th scope="col">Day</th>{series.map(item => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th>{series.map((item, seriesIndex) => <td key={item.label}>{Number.isFinite(row.values[seriesIndex]) ? format(row.values[seriesIndex]) : "—"}</td>)}</tr>)}</tbody></table></div> : data.length ?
      <svg className="v7-plot" viewBox={`0 0 ${width} ${height}`} data-plot-width={width} role="group" aria-label={title}>
        {ticks.map(tick => tick / maximum).map(value => <g key={value}><line x1={left} x2={plotRight} y1={y(value * maximum)} y2={y(value * maximum)} className={value === 0 ? "v7-chart-axis" : "v7-chart-grid"} /><text x={left - 8} y={y(value * maximum) + 4} textAnchor="end" className="v7-chart-text">{format(value * maximum)}</text></g>)}
        {targetShown && <g className="v7-chart-target-group"><line x1={left} x2={plotRight + 4} y1={y(target!)} y2={y(target!)} className="v7-chart-target" /><text x={plotRight + 8} y={y(target!) - 2} textAnchor="start" className="v7-chart-data-label"><tspan x={plotRight + 8}>Goal</tspan><tspan x={plotRight + 8} dy="12">{format(target!)}</tspan></text></g>}
        {kind === "line" && area && !!data.length && series.map((item, index) => <polygon key={item.label} fill={color(index)} opacity=".08" points={`${point(0)},${bottom} ${data.map((row, i) => `${point(i)},${y(row.values[index] ?? 0)}`).join(" ")} ${point(data.length - 1)},${bottom}`} />)}
        {kind === "line" && series.map((item, index) => <polyline key={item.label} fill="none" stroke={color(index)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((row, i) => `${point(i)},${y(row.values[index] ?? 0)}`).join(" ")} />)}
        {data.map((row, index) => {
          let accumulated = 0;
          const peakValue = kind === "stacked" ? sum(row.values) : Math.max(...row.values, 0), valueText = format(peakValue);
          // F06: a value label only when it fits its bar and says something (never "0 min").
          const valueLabel = peakValue > 0 && (kind === 'line' ? index === data.length - 1 : data.length <= 7 && labelWidth(valueText) <= group - 2);
          return <g key={`${row.label}-${index}`} role="button" data-chart-point="" tabIndex={selected === index || selected === null && index === 0 ? 0 : -1}
            aria-label={`${row.label}: ${row.values.map((value, j) => `${series[j]?.label ?? ""} ${format(value)}`).join(", ")}`}
            onClick={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)}
            onKeyDown={event => { movePoint(event, index, data.length); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); } }}>
            {/* N125: the selected column is a faint band, not the browser's focus ring (which showed on every tap). */}
            {selected === index && <rect className="v7-chart-band" x={point(index) - group / 2 + 1} y={top - 4} width={Math.max(0, group - 2)} height={plotHeight + 4} rx={4} />}
            {kind === "line" ? row.values.map((value, j) => <circle key={j} cx={point(index)} cy={y(value)} r="4" fill={color(j)} stroke="var(--v7-role-surface-page)" strokeWidth="2" />) : row.values.map((value, j) => {
              const start = accumulated; accumulated += finite(value);
              const topY = kind === "stacked" ? y(accumulated) : y(value), heightY = kind === "stacked" ? Math.max(0, y(start) - topY - (j ? 2 : 0)) : bottom - topY;
              const x = point(index) - bar / 2 + (kind === "bars" ? j * bar / Math.max(1, series.length) : 0), w = kind === "bars" ? bar / Math.max(1, series.length) : bar;
              const radius = kind === "stacked" && j !== row.values.length - 1 ? 0 : Math.min(4, w / 2, heightY / 2);
              return <path key={j} d={`M${x} ${topY + heightY}V${topY + radius}Q${x} ${topY} ${x + radius} ${topY}H${x + w - radius}Q${x + w} ${topY} ${x + w} ${topY + radius}V${topY + heightY}Z`} fill={color(j)} />;
            })}
            {valueLabel && <text x={point(index)} y={Math.max(16, y(peakValue) - 8)} textAnchor={kind === 'line' && index === data.length - 1 ? "end" : "middle"} className="v7-chart-data-label">{valueText}</text>}
            <rect x={point(index) - group / 2} y={top} width={group} height={plotHeight} fill="transparent" />
            {ticksShown[index] && <text x={point(index)} y={height - 16} textAnchor="middle" className="v7-chart-text">{row.tickLabel??row.label}</text>}
          </g>;
        })}
        {labels.map(({item,j,index,actual,labelY})=><g key={item.label} aria-hidden="true">
          <path d={`M${point(index)+bar/2} ${actual}L${plotRight+4} ${labelY}H${plotRight+8}`} fill="none" stroke={color(j)} strokeWidth="1"/>
          <foreignObject x={plotRight+10} y={labelY-10} width={92} height={22}><span className="v7-chart-direct-label">{(item.subject??subjectFor(item.label))&&<SubjectMark subject={(item.subject??subjectFor(item.label))!}/>}<span>{item.label}</span></span></foreignObject>
        </g>)}
      </svg> : null}
  </section>;
}
export function HorizontalBars({ title, data, format = String }: { title: string; data: { label: string; value: number; color?: string }[]; format?: (value: number) => string }) {
  const id = useId(), [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(item => finite(item.value))), total = data.reduce((value, item) => value + finite(item.value), 0);
  return <section className="v7-chart" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">You studied {format(total)} across {data.length} {data.length===1?'subject':'subjects'}, most in {data.reduce((best,item)=>item.value>best.value?item:best,data[0]??{label:'',value:0}).label}.</p>
    {table ? <table><thead><tr><th scope="col">Subject</th><th scope="col">Time</th></tr></thead><tbody>{data.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td>{format(item.value)}</td></tr>)}</tbody></table> :
      <ul className="v7-horizontal-bars">{data.map((item, index) => <li key={item.label}><button type="button" data-chart-point="" onKeyDown={event => { movePoint(event, index, data.length); }} onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)}>
        <span className="v7-subject-label">{subjectFor(item.label) && <SubjectMark subject={subjectFor(item.label)!} />}{item.label}</span><span>{format(item.value)}</span>
        <span className="v7-horizontal-track"><span style={{ width: `${bounded(item.value / max) * 100}%`, background: item.color ?? "var(--v7-role-subject-analysis)" }} /></span>
      </button></li>)}</ul>}
    {selected !== null && data[selected] && !table && <p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {data[selected].label}</p>}
  </section>;
}
function displayHeatmapDate(value: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDay(value) : value; }
const isDay = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
/**
 * V16 (v7 UX audit r3): the almanac drew 26 weeks, most of them empty, starting in the past. Keep the days from the
 * Monday of the week of the first study day (or, with no study yet, the last four weeks), so it starts where the record
 * starts. Days are oldest first, one per date.
 */
export function heatmapDays<T extends { date: string; value: number }>(data: readonly T[]): T[] {
  if (!data.length || !isDay(data[0].date)) return [...data];
  const firstStudy = data.findIndex(item => finite(item.value) > 0);
  const from = firstStudy < 0 ? Math.max(0, data.length - 28) : firstStudy;
  const weekday = (new Date(`${data[from].date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return data.slice(Math.max(0, from - weekday));
}
/**
 * V36: the day under a point of the almanac grid (columns are weeks, rows Monday to Sunday), or null before the first
 * day or after the last. A point in a gap between two cells goes to the nearer one.
 */
export function heatmapIndexAt({x, y, width, height, gapX = 0, gapY = 0, weeks, offset, days}: {x: number; y: number; width: number; height: number; gapX?: number; gapY?: number; weeks: number; offset: number; days: number}): number | null {
  if (!(width > 0 && height > 0 && weeks > 0)) return null;
  const column = Math.min(weeks - 1, Math.max(0, Math.floor((x + gapX / 2) / ((width + gapX) / weeks))));
  const row = Math.min(6, Math.max(0, Math.floor((y + gapY / 2) / ((height + gapY) / 7))));
  const index = column * 7 + row - offset;
  return index >= 0 && index < days ? index : null;
}
export function Heatmap({ title, data: all, format = String }: { title: string; data: { date: string; value: number }[]; format?: (value: number) => string }) {
  const id = useId(), [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const data = heatmapDays(all), scroller = useRef<HTMLDivElement>(null);
  const total = data.reduce((value, item) => value + finite(item.value), 0), today = new Date().toLocaleDateString("en-CA");
  const first = data[0]?.date, offset = first && /^\d{4}-\d{2}-\d{2}$/.test(first) ? (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const weeks = Math.ceil((data.length + offset) / 7), style = { "--v7-heat-weeks": Math.max(1, weeks) } as CSSProperties;
  // V16: the roving focus starts on today (else the newest day), and the almanac opens scrolled so that day is in view.
  const todayIndex = data.findIndex(item => item.date === today), home = todayIndex >= 0 ? todayIndex : data.length - 1;
  useLayoutEffect(() => {
    const view = scroller.current, cell = view?.querySelectorAll<HTMLElement>("[data-chart-point]")[home];
    if (!view || !cell) return;
    const from = view.getBoundingClientRect(), at = cell.getBoundingClientRect();
    if (at.right > from.right || at.left < from.left) view.scrollLeft += at.right - from.right + 8;
  }, [table, home, data.length]);
  // V36: the almanac is one touch target, like a slider: a tap anywhere on the grid (gaps included) picks the day under
  // the finger, and a mouse picks as it moves. The 24 px cells keep their roving focus for keys and screen readers.
  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect(), style = getComputedStyle(event.currentTarget);
    if (!box.width || !box.height) return;
    const index = heatmapIndexAt({x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height, gapX: parseFloat(style.columnGap) || 0, gapY: parseFloat(style.rowGap) || 0, weeks, offset, days: data.length});
    if (index !== null) setSelected(index);
  };
  return <section className="v7-chart" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">You studied {format(total)} across {data.length} days; {data.filter(item => item.value > 0).length} days had study activity.</p>
    {table ? <div className="v7-chart-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Time</th></tr></thead><tbody>{data.map(item => <tr key={item.date}><th scope="row">{displayHeatmapDate(item.date)}</th><td>{format(item.value)}</td></tr>)}</tbody></table></div> : <>
      <div ref={scroller} className="v7-heatmap-scroll" tabIndex={0} aria-label="Activity calendar; scroll to see all weeks"><div className="v7-heatmap-frame" style={style}>
        <div className="v7-heatmap-weeks" aria-hidden="true">{Array.from({length:weeks},(_,week)=>{const date=new Date(`${first}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-offset+week*7);return <span key={week}>{week%2===0?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(date):""}</span>;})}</div>
        <div className="v7-heatmap-days" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="v7-heatmap" role="group" aria-label={title} onPointerDown={pick} onPointerMove={event => { if (event.pointerType === "mouse") pick(event); }}>
          {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
          {data.map((item, index) => <button type="button" key={item.date} data-chart-point="" tabIndex={selected === index || selected === null && index === home ? 0 : -1}
            aria-current={item.date === today ? "date" : undefined} aria-label={`${displayHeatmapDate(item.date)}: ${format(item.value)}`}
            style={{ "--v7-heat-color": item.value <= 0 ? "transparent" : `var(--v7-role-viz-heat${item.value <= 15 ? 1 : item.value <= 30 ? 2 : item.value <= 60 ? 3 : 4})` } as CSSProperties}
            onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onKeyDown={event => { movePoint(event, index, data.length, 7); }}><span aria-hidden="true" /></button>)}
        </div>
      </div></div>
      <p className="v7-caption">Last {weeks} weeks, today ringed.</p>
      <div className="v7-heat-swatches" aria-label="Heatmap legend">{["0", "1–15", "16–30", "31–60", "60+ min"].map((label, index) => <span key={label}><i style={{ background: index === 0 ? "transparent" : `var(--v7-role-viz-heat${index})` }} aria-hidden="true" />{label}</span>)}</div>
    </>}
    {selected !== null && data[selected] && !table && <p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {displayHeatmapDate(data[selected].date)}</p>}
  </section>;
}
