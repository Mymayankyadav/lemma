import {getApi} from '..';
import {getMode} from '../mode';
import {assembleAtlas,type AtlasReadModel} from '../../../supabase/functions/_shared/adaptive/atlas';
import {ATLAS_DEFAULTS,validateAtlasSettings} from '../../../supabase/functions/_shared/adaptive/policy';
import type {Kind} from '../../../supabase/functions/_shared/adaptive/kc';
import {useQuery,useQueryClient} from '@tanstack/react-query';
type Overlay={atlas:Record<string,unknown>;kinds:Record<string,Kind>;links:Record<string,boolean>};
const DEMO_ATLAS='lemma.demo.atlas-v3';
function overlay():Overlay{try{return JSON.parse(localStorage.getItem(DEMO_ATLAS)??'null')??{atlas:{},kinds:{},links:{}};}catch{return {atlas:{},kinds:{},links:{}};}}
async function command(resource:string,operation:string,target:Record<string,unknown>,patch:Record<string,unknown>,expectedVersion?:number){
 const {liveClient}=await import('../live/client'),db=liveClient(),{data,error}=await db.rpc('atlas_command',{p:{operationId:crypto.randomUUID(),schemaVersion:1,resource,operation,target,patch,...(expectedVersion?{expectedVersion}:{})}});if(error)throw Error(error.message);return data;
}
export async function getAtlasView(now=new Date()):Promise<AtlasReadModel>{
 const {rows}=await getApi().getAdaptiveData(now);if(getMode()==='demo'){const o=overlay();rows.settings={...rows.settings,atlas:{...ATLAS_DEFAULTS,...o.atlas}};rows.concepts=rows.concepts.map(c=>({...c,kind:o.kinds[c.id]??c.kind??'topic'}));rows.atlasLinks=(rows.atlasLinks??[]).map(l=>({...l,status:l.id in o.links?o.links[l.id]?'approved':'rejected':l.status}));}
 return assembleAtlas(rows,now);
}
export async function decideLink(id:string,approve:boolean,version:number){if(getMode()==='demo'){const o=overlay();o.links[id]=approve;localStorage.setItem(DEMO_ATLAS,JSON.stringify(o));return;}await command('atlas_links',approve?'approve':'reject',{id},{},version);}
export async function setConceptKind(id:string,kind:Kind,version:number){if(getMode()==='demo'){const o=overlay();o.kinds[id]=kind;localStorage.setItem(DEMO_ATLAS,JSON.stringify(o));return;}await command('atlas_concepts','update',{id},{kind},version);}
export async function updateAtlasSettings(patch:Record<string,unknown>){const errors=validateAtlasSettings(patch);if(errors.length)throw Error(errors.join('; '));if(getMode()==='demo'){const o=overlay();o.atlas={...o.atlas,...patch};localStorage.setItem(DEMO_ATLAS,JSON.stringify(o));return;}await command('atlas_settings','update',{},patch);}
export const getAreaProfile=async(id:string)=>(await getAtlasView()).facets[id]??[];
export const getTrackRecord=async()=>(await getAtlasView()).health;
export const getThemes=async()=>(await getAtlasView()).themes;
export const getBridges=async(_subjectId?:string)=>(await getAtlasView()).bridges;
export const getFeasibility=async(projectId:string)=>(await getAtlasView()).fits[projectId];
export const getCardBudget=async()=>(await getAtlasView()).budget;
export const listAttempts=async(filter:{conceptId?:string;sessionId?:string;checkpointId?:string}={})=>{const v=await getAtlasView();return v.attempts.filter(a=>(!filter.sessionId||a.session_id===filter.sessionId)&&(!filter.checkpointId||a.checkpoint_id===filter.checkpointId)&&(!filter.conceptId||(v.model.facts.tags??[]).some(t=>String(t.attempt_id)===String(a.id)&&t.concept_id===filter.conceptId)));};
export function useAtlasModel(){return useQuery({queryKey:['atlas-model'],queryFn:()=>getAtlasView(),staleTime:30_000,refetchInterval:60_000});}
export function useRefreshAtlas(){const client=useQueryClient();return ()=>client.invalidateQueries({queryKey:['atlas-model']});}
