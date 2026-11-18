import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProficiencyValue,StageStrip,FitMeter,EstimateRange} from '../../../src/ui/v7/AtlasValues';
describe('Atlas v3 display invariants',()=>{
 it('I11 shown values carry intervals and session counts; inference is labelled',()=>{const v={p:.62,lo:.47,hi:.77,sessions:2,certified:false,state:'shown' as const};const shown=renderToStaticMarkup(<ProficiencyValue value={v}/>);expect(shown).toContain('0.62 (0.47–0.77)');expect(shown).toContain('2 sessions');expect(renderToStaticMarkup(<ProficiencyValue value={{...v,state:'inferred',inferredFrom:'Sets'}}/>)).toContain('inferred from Sets');expect(renderToStaticMarkup(<ProficiencyValue value={{...v,state:'none'}}/>)).toContain('—');});
 it('stages distinguish not reached, hints, missing logs and legacy',()=>{const text=renderToStaticMarkup(<StageStrip stages={[{stage:'U',result:'ok'},{stage:'S',result:'fail',hint:2},{stage:'E',result:'not_reached'}]} cued/>);expect(text).toContain('U: ok');expect(text).toContain('S: hint 2');expect(text).toContain('E: not reached');expect(text).toContain('C: unlogged');expect(renderToStaticMarkup(<StageStrip stages={[]} legacy/>)).toContain('legacy');});
 it('fit and durations preserve uncertainty in their accessible labels',()=>{expect(renderToStaticMarkup(<FitMeter pAll={.87} pCore={.97} required={90} supply={120}/>)).toContain('Plan fits 87% · core 97%');expect(renderToStaticMarkup(<EstimateRange p10={45} p90={90}/>)).toContain('80% range 45 to 90');});
});
