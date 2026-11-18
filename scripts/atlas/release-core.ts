// Atlas v3 cutover, pure part: from one owner's exported facts (scripts/atlas/export.sql) compute what atlas_v2_activate needs that only the
// production data can give: the v3 model fit (the model_fits row), the four-stream diagnostics and the Atlas card token gate. Used by release.mts.
import {assembleAtlas,atlasCard,factsForAtlas,type AtlasRows} from '../../supabase/functions/_shared/adaptive/atlas.ts';
import {nightlyFit} from '../../supabase/functions/_shared/adaptive/fit.ts';
import {tokenGates} from '../../supabase/functions/_shared/adaptive/tokens.ts';

export type Fit={input_hash:string;params:Record<string,unknown>;scores:Record<string,unknown>};
export function modelFit(rows:AtlasRows):Fit{
 const r=nightlyFit(factsForAtlas(rows));
 return {input_hash:r.inputHash,params:r.fit as Record<string,unknown>,scores:{health:r.health}};
}
/** The one statement that stores the fit; run as the service role, after the Owner's yes. Values are bound as JSON literals, never concatenated SQL. */
export function fitSql(owner:string,fit:Fit):string{
 if(!/^[0-9a-f-]{36}$/i.test(owner))throw Error('owner must be a uuid');
 const text=(v:string)=>"'"+v.replace(/'/g,"''")+"'",json=(v:unknown)=>text(JSON.stringify(v))+'::jsonb';
 return 'insert into public.model_fits(user_id,input_hash,params,scores) values('+text(owner)+'::uuid,'+text(fit.input_hash)+','+json(fit.params)+','+json(fit.scores)+') on conflict (user_id,input_hash) do nothing;';
}
export type Diagnostic={stream:string;n:number;status:string};
export function diagnostics(rows:AtlasRows,fit:Fit,now:Date):{diagnostics:Diagnostic[];card_tokens_max:number}{
 const withFit={...rows,modelFits:[...(rows.modelFits??[]),{fitted_at:now.toISOString(),params:fit.params}]};
 const view=assembleAtlas(withFit,now);
 const streams=['attempt','card','duration','attendance'];
 const diagnostics=streams.map(stream=>{const h=view.health.find(x=>x.stream===stream);return {stream,n:h?.n??0,status:h?.status??'insufficient data'};});
 const cards=view.model.facts.concepts.map(c=>atlasCard(view,c.id));
 return {diagnostics,card_tokens_max:tokenGates({resumes:[],cards}).card_tokens_max};
}
/** Merges the measured gates (research/sim/gates.py), the production numbers and the two checks the release run confirms into the report atlas_v2_activate takes. */
export function releaseReport(input:{gates:Record<string,number>;diagnostics:Diagnostic[];card_tokens_max:number;resume_tokens_max:number;parity_ok:boolean;no_beta_imports:boolean}){
 return {gates:{...input.gates,card_tokens_max:input.card_tokens_max,resume_tokens_max:input.resume_tokens_max},diagnostics:input.diagnostics,parity_ok:input.parity_ok,no_beta_imports:input.no_beta_imports};
}

/** 07 Acceptance 5: no module imports the Beta proficiency model. `sources` maps a path to its text. */
export function betaImports(sources:Record<string,string>):string[]{
 return Object.entries(sources).filter(([path,text])=>!/proficiency\.ts$/.test(path)&&/from\s+['"][^'"]*\/proficiency(\.ts)?['"]/.test(text)).map(([path])=>path).sort();
}
