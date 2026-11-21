import {useState} from 'react';
import {Link} from 'react-router';
import {ProficiencyValue} from '../../../ui/v7/AtlasValues';
import {TodayScheduler} from '../Views';
import {useAgenda} from '../../../data/adaptive/agenda-api';
import {useAtlasModel,useRefreshAtlas,updateAtlasSettings} from '../../../data/adaptive/atlas-api';
import {ATLAS_DEFAULTS} from '../../../../supabase/functions/_shared/adaptive/policy';
import {reliabilityBins} from '../../../../supabase/functions/_shared/adaptive/diagnostics';
import {Button,Switch} from '../../../ui/v7/components';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {formatDateTime} from '../../../lib/format';
import {isFlagOn} from '../../../flags';

const tuning = [
  ['threshold_p','Mastery threshold',.8,.95,.01],
  ['stretch_share','Stretch share',0,.25,.01],
  ['plan_first_min','Plan-first minimum minutes',0,120,1],
  ['card_quota_share','Card quota share',.25,1,.05],
  ['card_cap','Card share of a block',.05,.4,.025],
  ['card_weight','Card weight in exam utility',0,1,.1],
] as const;

export function Diagnostics() {
  const atlas = useAtlasModel(), agenda = useAgenda(), refresh = useRefreshAtlas();
  const [patch, setPatch] = useState<Record<string, number | boolean>>({});
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const decision = agenda.query.data?.decision;
  const settings = atlas.data?.settings ?? ATLAS_DEFAULTS;
  const trackRecord = reliabilityBins((atlas.data?.model.trace ?? []).filter(row => row.stream === 'attempt'));
  async function save() {
    setSaving(true);
    setError('');
    try {
      await updateAtlasSettings(patch);
      await refresh();
      setPatch({});
    } catch {
      setError('Could not save Atlas settings.');
    } finally {
      setSaving(false);
    }
  }
  return <div className="v7-settings-body" data-v7-diagnostics="">
    <Disclosure label="Decision details" defaultOpen>
      {decision ? <dl>
        <dt>Algorithm</dt><dd>{decision.requested}</dd>
        <dt>Policy version</dt><dd>{decision.policyVersion}</dd>
        <dt>Checked</dt><dd>{formatDateTime(decision.asOf,{clock24h:true})}</dd>
        <dt>Reason</dt><dd>{decision.reason}</dd>
        {agenda.query.data?.baselineLabel&&<><dt>Native alternative</dt><dd>{agenda.query.data.baselineLabel}</dd></>}
        {agenda.query.data?.practice?.status==='available'&&<><dt>Practice estimate</dt><dd>{Math.round((agenda.query.data.practice.forecast?.probability??agenda.query.data.practice.native)*100)}%</dd></>}
      </dl> : <p>No decision yet.</p>}
    </Disclosure>
    <Disclosure label="Schedule details"><TodayScheduler/></Disclosure>
    {isFlagOn('atlasV3') && <>
      <Disclosure label="Knowledge by area">
       <div className="v7-atlas-scroll"><table><thead><tr><th>Area</th>{['Knowledge','Select','Execute','Transfer'].map(label=><th key={label}>{label}</th>)}</tr></thead>
        <tbody>{atlas.data?.model.facts.concepts.filter(concept=>concept.level==='system').map(concept=><tr key={concept.id}>
         <th scope="row"><Link to={'/atlas?id='+encodeURIComponent(concept.id)}>{concept.name}</Link></th>
         {['understand','select','execute','transfer'].map(facet=>{const value=atlas.data?.facets[concept.id]?.find(item=>item.facet===facet);
          return <td key={facet}>{value?<ProficiencyValue value={value}/>:<span>None yet</span>}</td>;})}
        </tr>)}</tbody></table></div>
      </Disclosure>
      <Disclosure label="Model health">
        {atlas.data?.health.length ? <ul>{atlas.data.health.map(item => <li key={item.stream}>
          <strong>{item.stream}</strong> · {item.n} observations · {item.status}
          {item.n >= 50 && <p>{Object.entries(item.tests).filter(([,value]) => value !== null)
            .map(([key,value]) => key + ' ' + (value ? 'pass' : 'fail')).join(' · ')}</p>}
          {item.n>=50&&<p>Log loss {item.loss.toFixed(3)} · PFA {item.pfa.toFixed(3)} · Baseline {item.baseline.toFixed(3)} · Slope {item.b.toFixed(2)}</p>}
          {item.actions.map(action => <p key={action}>{action}</p>)}
        </li>)}</ul> : <p>No observations yet.</p>}
        <h3 className="v7-eyebrow">Track record</h3>
        {trackRecord.length>0&&<figure aria-label="Calibration: predicted against observed">
          <svg viewBox="0 0 160 160" role="img" aria-label="Predicted probability against observed rate; the diagonal is perfect calibration" width="100%" style={{maxWidth:'20rem'}}>
            <line x1="8" y1="152" x2="152" y2="8" stroke="currentColor" strokeDasharray="3 3" opacity=".5" vectorEffect="non-scaling-stroke"/>
            {trackRecord.map(row=><circle key={row.lo} cx={8+row.predicted*144} cy={152-row.observed*144} r={2+Math.min(4,Math.sqrt(row.n)/2)} fill="currentColor"/>) }
          </svg>
          <figcaption className="v7-meta">On the dashed line, a prediction of 70% comes true 70% of the time.</figcaption>
        </figure>}
        {trackRecord.length ? <ul aria-label="Predicted and observed success rates">
          {trackRecord.map(row => <li key={row.lo}>{Math.round(row.predicted*100)}% predicted · {Math.round(row.observed*100)}% observed · {row.n} attempts</li>)}
        </ul> : <p>Insufficient data to compare predictions with outcomes.</p>}
        <Disclosure label="Diagnostic key"><dl>{Object.entries({D1:'Performance against the baseline',D2:'Calibration of predicted outcomes',D3:'Unexplained patterns by study condition',D4:'Distribution of prediction errors',D5:'Coverage of duration intervals'}).map(([key,label])=><div key={key}><dt>{key}</dt><dd>{label}</dd></div>)}</dl></Disclosure>
      </Disclosure>
      <Disclosure label="Atlas tuning">
        <form className="v7-atlas-panel" onSubmit={event => {event.preventDefault();void save();}}>
          {tuning.map(([key,label,min,max,step]) => <label key={key}>{label}
            <input type="number" min={min} max={max} step={step} required value={Number(patch[key] ?? settings[key])}
              onChange={event => setPatch(value => ({...value,[key]:event.target.valueAsNumber}))}/>
          </label>)}
          <Switch label="Ask confidence before problems" checked={Boolean(patch.ask_confidence ?? settings.ask_confidence)}
            onChange={checked => setPatch(value => ({...value,ask_confidence:checked}))}/>
          <Button type="submit" loading={saving} disabled={!Object.keys(patch).length}>Save Atlas settings</Button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Disclosure>
    </>}
  </div>;
}
