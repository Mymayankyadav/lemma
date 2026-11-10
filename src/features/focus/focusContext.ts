import {useEffect,useState} from 'react';
import {getApi} from '../../data';
import {getPresetApi} from '../../data/presets';
import type {StudyEntryRecord} from '../../data/study/contract';
import {plainMath} from '../../lib/plain-math';

/** What a focus session is about, as the mockup shows it: the heading is the linked path
 * (or the chosen activity), the subtitle is the linked checkpoint. Bugs #1312, #1314. */
export interface FocusContext {heading:string|null;checkpoint:string|null;path:string|null;
 /** N121 C6: the linked path's subject glyph for the watermark; none without a link. */
 glyph?:string|null}
export const emptyFocusContext:FocusContext={heading:null,checkpoint:null,path:null,glyph:null};

/** Owner reads only; any failure leaves a field empty rather than inventing a label. */
export async function resolveFocusContext(entry:Pick<StudyEntryRecord,'presetId'|'projectId'|'checkpointId'>):Promise<FocusContext>{
 let heading:string|null=null,checkpoint:string|null=null,path:string|null=null,glyph:string|null=null;
 if(entry.projectId){
  try{
   const project=(await getApi().listProjects()).find(row=>row.id===entry.projectId);
   if(project){
    heading=plainMath(project.title);path=heading;glyph=project.subject?.glyph||null;
    if(entry.checkpointId){
     const detail=await getApi().getProject(project.slug);
     const cp=detail.checkpoints.find(row=>row.id===entry.checkpointId);
     if(cp)checkpoint=cp.code+' · '+plainMath(cp.title);
    }
   }
  }catch{/* unavailable: keep the fields empty */}
 }
 if(!heading&&entry.presetId){
  try{heading=(await getPresetApi().getPreset(entry.presetId))?.label??null;}
  catch{/* unavailable */}
 }
 return {heading,checkpoint,path,glyph};
}

export function useFocusContext(entry:StudyEntryRecord|null):FocusContext{
 const [context,setContext]=useState<FocusContext>(emptyFocusContext);
 const key=entry?[entry.id,entry.presetId,entry.projectId,entry.checkpointId].join('|'):'';
 useEffect(()=>{
  let alive=true;
  setContext(emptyFocusContext);
  if(entry)void resolveFocusContext(entry).then(value=>{if(alive)setContext(value);});
  return()=>{alive=false;};
 // The key covers every field the resolver reads.
 },[key]);
 return context;
}

/** The mockup's cycle caption ("Pomodoro 2 of 4 · 50 min focus / 10 min break"). */
export function cycleCaption(entry:Pick<StudyEntryRecord,'mode'|'config'|'cycle'|'phase'>):string{
 const phase=entry.phase==='long_break'?'Long break · ':entry.phase==='break'?'Break · ':'';
 if(entry.mode==='pomodoro'){
  const focus=Number(entry.config?.focus_minutes)||25,rest=Number(entry.config?.break_minutes)||5;
  const cycles=Number(entry.config?.cycles)||4,cycle=Math.min(cycles,Math.max(1,entry.cycle??1));
  return phase+'Pomodoro '+cycle+' of '+cycles+' · '+focus+' min focus / '+rest+' min break';
 }
 if(entry.mode==='flowtime')return phase+'Flowtime · focus as long as it flows, then rest';
 return phase+'Open focus · no phase limit';
}
