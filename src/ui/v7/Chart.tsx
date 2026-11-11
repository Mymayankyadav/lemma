import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { bounded } from "../charts/types";
import { formatDay } from "../../lib/format";
import { SubjectMark, subjects, type Subject } from "./KitPrimitives";
import "./chart.css";

export interface ChartDatum { label: string; values: number[] }
export interface ChartSeries { label: string; color?: string; subject?: Subject }
export interface ChartProps { title: string; data: ChartDatum[]; series: ChartSeries[]; kind?: "line" | "bars" | "stacked" | "heatmap"; area?: boolean; target?: number; format?: (value: number) => string; summary?: string; compact?: boolean }
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
export function Chart({ title, data, series, kind = "bars", area = false, target, format = String, summary: suppliedSummary, compact = false }: ChartProps) {
  const [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null), id = useId();
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
    `You studied ${format(total)} in this range, most on ${data[peak].label}.`);
  const width = 360, height = compact ? 150 : 224, left = 40, bottom = compact ? 116 : 180, top = compact ? 20 : 36, plotHeight = bottom - top;
  const group = (width - left - 24) / Math.max(1, data.length), bar = group * .5;
  const point = (index: number) => left + group * (index + .5);
  const y = (value: number) => bottom - Math.min(maximum, finite(value)) / maximum * plotHeight;
  // KC3/KC4: subject colour means a subject. A series that is not a subject takes the neutral data colour, never indigo.
  const color = (index: number) => {
    const item = series[index], subject = item?.subject ?? subjectFor(item?.label ?? "");
    if (item?.color) return item.color;
    if (subject && subject !== "Other") return `var(--v7-role-subject-${subject.toLowerCase().replace(" ", "-")})`;
    return series.length === 1 ? "var(--v7-role-viz-neutral)" : `var(--v7-role-subject-${["analysis", "algebra", "topology", "number-theory", "geometry", "logic", "probability", "combinatorics"][index % 8]})`;
  };
  const selectedRow = selected === null ? null : data[selected];
  return <section className="v7-chart" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">{summary}</p>
    {!!data.length && series.length > 1 && <ul className="v7-chart-legend">{series.map((seriesItem, index) => {
      const subject = seriesItem.subject ?? subjectFor(seriesItem.label);
      return <li key={seriesItem.label}>{subject && <SubjectMark subject={subject} />}<span>{seriesItem.label}</span><i style={{ background: color(index) }} aria-hidden="true" /></li>;
    })}</ul>}
    {table ? <div className="v7-chart-scroll"><table><caption className="v7-sr-only">{title}</caption><thead><tr><th scope="col">Day</th>{series.map(item => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th>{series.map((item, seriesIndex) => <td key={item.label}>{Number.isFinite(row.values[seriesIndex]) ? format(row.values[seriesIndex]) : "—"}</td>)}</tr>)}</tbody></table></div> : data.length ?
      <svg className="v7-plot" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title}>
        {ticks.map(tick => tick / maximum).map(value => <g key={value}><line x1={left} x2={width - 16} y1={y(value * maximum)} y2={y(value * maximum)} className={value === 0 ? "v7-chart-axis" : "v7-chart-grid"} /><text x={left - 8} y={y(value * maximum) + 4} textAnchor="end" className="v7-chart-text">{format(value * maximum)}</text></g>)}
        {target !== undefined && target >= 0 && target <= maximum && <g><line x1={left} x2={width - 16} y1={y(target)} y2={y(target)} className="v7-chart-target" /><text x={width - 16} y={y(target) - 6} textAnchor="end" className="v7-chart-data-label">Goal {format(target)}</text></g>}
        {kind === "line" && area && !!data.length && series.map((item, index) => <polygon key={item.label} fill={color(index)} opacity=".08" points={`${point(0)},${bottom} ${data.map((row, i) => `${point(i)},${y(row.values[index] ?? 0)}`).join(" ")} ${point(data.length - 1)},${bottom}`} />)}
        {kind === "line" && series.map((item, index) => <polyline key={item.label} fill="none" stroke={color(index)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((row, i) => `${point(i)},${y(row.values[index] ?? 0)}`).join(" ")} />)}
        {data.map((row, index) => {
          let accumulated = 0;
          return <g key={`${row.label}-${index}`} role="button" data-chart-point="" tabIndex={selected === index || selected === null && index === 0 ? 0 : -1}
            aria-label={`${row.label}: ${row.values.map((value, j) => `${series[j]?.label ?? ""} ${format(value)}`).join(", ")}`}
            onClick={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)}
            onKeyDown={event => { movePoint(event, index, data.length); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); } }}>
            {kind === "line" ? row.values.map((value, j) => <circle key={j} cx={point(index)} cy={y(value)} r="4" fill={color(j)} stroke="var(--v7-role-surface-page)" strokeWidth="2" />) : row.values.map((value, j) => {
              const start = accumulated; accumulated += finite(value);
              const topY = kind === "stacked" ? y(accumulated) : y(value), heightY = kind === "stacked" ? Math.max(0, y(start) - topY - (j ? 2 : 0)) : bottom - topY;
              const x = point(index) - bar / 2 + (kind === "bars" ? j * bar / Math.max(1, series.length) : 0), w = kind === "bars" ? bar / Math.max(1, series.length) : bar;
              const radius = kind === "stacked" && j !== row.values.length - 1 ? 0 : Math.min(4, w / 2, heightY / 2);
              return <path key={j} d={`M${x} ${topY + heightY}V${topY + radius}Q${x} ${topY} ${x + radius} ${topY}H${x + w - radius}Q${x + w} ${topY} ${x + w} ${topY + radius}V${topY + heightY}Z`} fill={color(j)} />;
            })}
            {(kind !== "line" || index === data.length - 1) && <text x={point(index)} y={Math.max(16, y(kind === "stacked" ? accumulated : Math.max(...row.values, 0)) - 8)} textAnchor="middle" className="v7-chart-data-label">{format(kind === "stacked" ? accumulated : Math.max(...row.values, 0))}</text>}
            <rect x={point(index) - group / 2} y={top} width={group} height={plotHeight} fill="transparent" />
            <text x={point(index)} y={height - 16} textAnchor="middle" className="v7-chart-text">{row.label}</text>
          </g>;
        })}
      </svg> : null}
    {selectedRow && !table && <p className="v7-chart-tooltip" role="status">{selectedRow.values.map((value, index) => `${format(value)} ${series[index]?.label ?? ""}`).join(" · ")} · {selectedRow.label}</p>}
  </section>;
}
export function HorizontalBars({ title, data, format = String }: { title: string; data: { label: string; value: number; color?: string }[]; format?: (value: number) => string }) {
  const id = useId(), [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(item => finite(item.value))), total = data.reduce((value, item) => value + finite(item.value), 0);
  return <section className="v7-chart" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">You studied {format(total)} across {data.length} subjects; bars are scaled to highest ({format(max)}).</p>
    {table ? <table><thead><tr><th scope="col">Subject</th><th scope="col">Time</th></tr></thead><tbody>{data.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td>{format(item.value)}</td></tr>)}</tbody></table> :
      <ul className="v7-horizontal-bars">{data.map((item, index) => <li key={item.label}><button type="button" data-chart-point="" onKeyDown={event => { movePoint(event, index, data.length); }} onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)}>
        <span className="v7-subject-label">{subjectFor(item.label) && <SubjectMark subject={subjectFor(item.label)!} />}{item.label}</span><span>{format(item.value)}</span>
        <span className="v7-horizontal-track"><span style={{ width: `${bounded(item.value / max) * 100}%`, background: item.color ?? "var(--v7-role-subject-analysis)" }} /></span>
      </button></li>)}</ul>}
    {selected !== null && data[selected] && !table && <p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {data[selected].label}</p>}
  </section>;
}
function displayHeatmapDate(value: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDay(value) : value; }
export function Heatmap({ title, data, format = String }: { title: string; data: { date: string; value: number }[]; format?: (value: number) => string }) {
  const id = useId(), [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const total = data.reduce((value, item) => value + finite(item.value), 0), today = new Date().toLocaleDateString("en-CA");
  const first = data[0]?.date, offset = first && /^\d{4}-\d{2}-\d{2}$/.test(first) ? (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const weeks = Math.ceil((data.length + offset) / 7), style = { "--v7-heat-weeks": Math.max(1, weeks) } as CSSProperties;
  return <section className="v7-chart" aria-labelledby={id} aria-describedby={`${id}-summary`}>
    <div className="v7-chart-heading"><h3 id={id} className="v7-headline">{title}</h3><button type="button" className="v7-chart-toggle" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show as table"}</button></div>
    <p id={`${id}-summary`} className="v7-chart-summary">You studied {format(total)} across {data.length} days; {data.filter(item => item.value > 0).length} days had study activity.</p>
    {table ? <div className="v7-chart-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Time</th></tr></thead><tbody>{data.map(item => <tr key={item.date}><th scope="row">{displayHeatmapDate(item.date)}</th><td>{format(item.value)}</td></tr>)}</tbody></table></div> : <>
      <div className="v7-heatmap-scroll" tabIndex={0} aria-label="Activity calendar; scroll to see all weeks"><div className="v7-heatmap-frame" style={style}>
        <div className="v7-heatmap-weeks" aria-hidden="true">{Array.from({length:weeks},(_,week)=>{const date=new Date(`${first}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-offset+week*7);return <span key={week}>{week%2===0?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(date):""}</span>;})}</div>
        <div className="v7-heatmap-days" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="v7-heatmap" role="group" aria-label={title}>
          {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
          {data.map((item, index) => <button type="button" key={item.date} data-chart-point="" tabIndex={selected === index || selected === null && index === 0 ? 0 : -1}
            aria-current={item.date === today ? "date" : undefined} aria-label={`${displayHeatmapDate(item.date)}: ${format(item.value)}`}
            style={{ "--v7-heat-color": item.value <= 0 ? "transparent" : `var(--v7-role-viz-heat${item.value <= 15 ? 1 : item.value <= 30 ? 2 : item.value <= 60 ? 3 : 4})` } as CSSProperties}
            onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onKeyDown={event => { movePoint(event, index, data.length, 7); }}><span aria-hidden="true" /></button>)}
        </div>
      </div></div>
      <p className="v7-caption">{weeks} weeks · Scroll horizontally on narrow screens. Today has an outlined cell.</p>
      <div className="v7-heat-swatches" aria-label="Heatmap legend">{["0", "1–15", "16–30", "31–60", "60+ min"].map((label, index) => <span key={label}><i style={{ background: index === 0 ? "transparent" : `var(--v7-role-viz-heat${index})` }} aria-hidden="true" />{label}</span>)}</div>
    </>}
    {selected !== null && data[selected] && !table && <p role="status" className="v7-chart-tooltip">{format(data[selected].value)} · {displayHeatmapDate(data[selected].date)}</p>}
  </section>;
}
