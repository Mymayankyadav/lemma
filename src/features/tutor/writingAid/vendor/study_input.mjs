import {createAccelerator,makeAccelerator} from './accelerator.mjs';

const marker='In words, ';
const relation=/(?:[A-Za-zα-ωΑ-Ω]|\d+)\s*(?:=|≠|∈|∉|<|≤|>|≥|⊆|⊊)\s*(?:[A-Za-zα-ωΑ-Ω]|\d+)\. $/u;

// Authorization belongs to the entire learner-authored prefix, up to this
// occurrence of the marker. A different operand, symbol or occurrence revokes it.
export function formulaAnchor(text){
  if(typeof text!=='string'||text.length>16000)return null;
  const start=text.lastIndexOf(marker);
  if(start<0 || !relation.test(text.slice(0,start)))return null;
  const end=start+marker.length;
  if(/[.!?;\n]/u.test(text.slice(end)))return null;
  return text.slice(0,end);
}

function requireRequestedReading(aid){
  return {...aid,predict(text,opts={}){
    const out=aid.predict(text,opts),anchor=formulaAnchor(text);
    if(!anchor || opts.transcriptionAnchor===anchor)return out;
    if(opts.mode==='strict')return {keys:[],ghost:null};
    return {keys:(out.keys||[]).filter(k=>k.kind!=='transcription'),
      ghost:out.ghost?.kind==='transcription'?null:out.ghost};
  }};
}

export function makeStudyInput(assets,config={}){
  return requireRequestedReading(makeAccelerator(assets,config));
}

export async function createStudyInput(){
  return requireRequestedReading(await createAccelerator());
}
