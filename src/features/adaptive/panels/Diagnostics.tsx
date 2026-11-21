import {useState} from 'react';
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
      </dl> : <p>No decision yet.</p>}
    </Disclosure>
    {isFlagOn('atlasV3') && <>
      <Disclosure label="Model health">
        {atlas.data?.health.length ? <ul>{atlas.data.health.map(item => <li key={item.stream}>
          <strong>{item.stream}</strong> · {item.n} observations · {item.status}
          {item.n >= 50 && <p>{Object.entries(item.tests).filter(([,value]) => value !== null)
            .map(([key,value]) => key + ' ' + (value ? 'pass' : 'fail')).join(' · ')}</p>}
          {item.actions.map(action => <p key={action}>{action}</p>)}
        </li>)}</ul> : <p>No observations yet.</p>}
        <h3 className="v7-eyebrow">Track record</h3>
        {trackRecord.length ? <ul aria-label="Predicted and observed success rates">
          {trackRecord.map(row => <li key={row.lo}>{Math.round(row.predicted*100)}% predicted · {Math.round(row.observed*100)}% observed · {row.n} attempts</li>)}
        </ul> : <p>Insufficient data to compare predictions with outcomes.</p>}
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
