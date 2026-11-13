import {useEffect, useMemo, useState} from 'react';
import {Navigate} from 'react-router';
import {isFlagOn} from '../../../flags';
import {getStudyApi} from '../../../data/study';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {useInsightData, useSettings} from '../../../data/hooks';
import {buildInsights} from '../../../lib/insights';
import {formatDuration, formatShortDate, ownerZone} from '../../../lib/format';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button, Skeleton, StatTile} from '../../../ui/v7/components';
import {effortSummary} from '../../progress-v6/model';
import {currentPeriod} from '../../insights/v7/progressModel';
import '../../insights/v7/progress.css';
import './week.css';

/** The week's constellation: one star per day, its size by the minutes studied, joined in order by a thin line. */
export function weekStars(minutes: readonly number[]) {
  const most = Math.max(1, ...minutes);
  return minutes.map((value, index) => ({x: 20 + index * 40, y: 60 - Math.round(value / most * 40) + (index % 2 ? 6 : -6), r: value > 0 ? 2 + value / most * 4 : 1.5, lit: value > 0}));
}

/**
 * N157 · U4 S15 the week page (flag v7Week). The weekly digest as a page in the app: the week's constellation, hours,
 * cards and checkpoints. It is the Sunday notification's destination once the flag is on.
 */
export default function WeekV7() {
  const settings = useSettings(), zone = ownerZone(settings.data), now = useMemo(() => new Date(), []);
  const period = useMemo(() => currentPeriod('7', now, zone), [now, zone]);
  const [entries, setEntries] = useState<StudyEntryRecord[] | null>(null), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const insight = useInsightData(7);
  useEffect(() => {
    let alive = true; setFailed(false);
    getStudyApi().listStudyEntries(period.span).then(rows => {if (alive) setEntries(rows);}).catch(() => {if (alive) setFailed(true);});
    return () => {alive = false;};
  }, [period, reload]);
  const summary = useMemo(() => entries ? effortSummary(entries, period, zone, now.toISOString()) : null, [entries, period, zone, now]);
  const learn = useMemo(() => insight.data ? buildInsights(insight.data, 7, {timeZone: zone, rolloverHour: settings.data?.rolloverHour ?? 4}) : null, [insight.data, zone, settings.data?.rolloverHour]);
  const checkpoints = (insight.data?.checkpointEvents ?? []).filter(event => event.kind === 'demonstrated' && Date.parse(event.at) >= Date.parse(period.span.start) && Date.parse(event.at) < Date.parse(period.span.end)).length;
  if (!isFlagOn('v7Week')) return <Navigate to="/insights" replace/>;
  const minutes = summary?.daily.map(day => day.minutes) ?? [];
  const stars = weekStars(minutes);
  const range = formatShortDate(period.days[0], {zone}) + ' – ' + formatShortDate(period.days[period.days.length - 1], {zone});
  return <main id="main-content" className="v7-page v7-week" aria-label="The week">
    <DetailHeader title="The week" back="/insights"/>
    <header className="v7-week-head"><p className="v7-eyebrow">{range}</p><h1 className="v7-hub-title">Your week</h1></header>
    {failed && <div role="alert" className="v7-progress-error"><p>Erratum: the week didn’t load. Try again.</p><Button onClick={() => setReload(value => value + 1)}>Try again</Button></div>}
    {!failed && !summary && <Skeleton/>}
    {summary && <>
      <svg className="v7-week-sky" viewBox="0 0 280 80" role="img" aria-label={'The week as a constellation: ' + minutes.filter(value => value > 0).length + ' of 7 days with study'}>
        <polyline points={stars.filter(star => star.lit).map(star => star.x + ',' + star.y).join(' ')} className="v7-week-line"/>
        {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} className="v7-week-star" data-lit={star.lit || undefined}/>)}
      </svg>
      <div className="v7-progress-stats">
        <StatTile label="Hours" value={formatDuration(summary.daily.reduce((total, day) => total + day.minutes, 0))}/>
        <StatTile label="Cards" value={learn ? String(learn.reviews) : '—'}/>
        <StatTile label="Checkpoints" value={String(checkpoints)}/>
      </div>
    </>}
  </main>;
}
