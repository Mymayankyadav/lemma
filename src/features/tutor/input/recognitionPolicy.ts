import {symbolById} from './symbolCatalog';
import type {PartialMatch} from './partialSymbolMatcher';
import type {EditTarget,InkInferenceResult,InkModelRecognized,InkRecognized,InkResult,InkSnapshot,InkSnapshotIdentity} from './types';

/** Supplied only after held-out qualification for the exact packaged model, preprocessing and catalogue. */
export interface InkQualification {
  readonly assetSetVersion:string;
  readonly outputClassCount:number;
  readonly temperature:number;
  readonly minimumConfidence:number;
  readonly minimumMargin:number;
  readonly maximumUnknownMass:number;
  readonly qualifiedSymbols:readonly string[];
  readonly heldOut:Readonly<{accepted:number;errors:number;writers:number;devices:number}>;
}
const probability=(value:number)=>Number.isFinite(value)&&value>=0&&value<=1;

/** P(X ≤ errors) at the release error-rate target. The exact one-sided bound must be below that target. */
export function passesInkReleaseRate(accepted:number,errors:number) {
  if(!Number.isSafeInteger(accepted)||!Number.isSafeInteger(errors)||errors<0||accepted<1||errors>=accepted)return false;
  const target=.001;
  // Compute the binomial sum in log space to retain small values for large representative sets.
  let logTerm=accepted*Math.log1p(-target),logSum=logTerm;
  for(let k=1;k<=errors;k++){
    logTerm+=Math.log(accepted-k+1)-Math.log(k)+Math.log(target/(1-target));
    const maximum=Math.max(logSum,logTerm);
    logSum=maximum+Math.log(Math.exp(logSum-maximum)+Math.exp(logTerm-maximum));
    if(logSum>=Math.log(.05))return false;
  }
  return logSum<Math.log(.05);
}

export function sameEditTarget(left:EditTarget,right:EditTarget) {
  return left.scopeKey===right.scopeKey&&left.mountId===right.mountId&&left.editorRevision===right.editorRevision
    &&left.selectionRevision===right.selectionRevision&&left.modeRevision===right.modeRevision;
}
export function sameInkEpoch(left:InkSnapshotIdentity,right:InkSnapshotIdentity) {
  return left.sessionId===right.sessionId&&left.assetSetVersion===right.assetSetVersion
    &&left.inkEpoch===right.inkEpoch&&sameEditTarget(left.target,right.target);
}
export function sameInkSnapshot(left:InkSnapshotIdentity,right:InkSnapshotIdentity) {
  return sameInkEpoch(left,right)&&left.inkRevision===right.inkRevision;
}

type Scores={ranked:InkModelRecognized[];unknownMass:number};
const noScores:Scores={ranked:[],unknownMass:1};
function readScores(inference:InkInferenceResult,temperature:number,calibrated:boolean):Scores {
  const {rawScores,scoreKind}=inference;
  if(!Number.isFinite(temperature)||temperature<=0||!rawScores.length||rawScores.length>2048)return noScores;
  if(new Set(rawScores.map(item=>item.classId)).size!==rawScores.length)return noScores;
  if(scoreKind!=='logit'&&scoreKind!=='probability')return noScores;
  if(rawScores.some(item=>!Number.isFinite(item.score)||scoreKind==='probability'&&!probability(item.score)))return noScores;
  if(calibrated&&scoreKind==='probability'&&Math.abs(rawScores.reduce((sum,item)=>sum+item.score,0)-1)>.01)return noScores;
  const logits=rawScores.map(item=>(scoreKind==='logit'?item.score:Math.log(item.score))/temperature);
  const largest=Math.max(...logits);
  if(!Number.isFinite(largest))return noScores;
  const weights=logits.map(logit=>Math.exp(logit-largest));
  const total=weights.reduce((sum,value)=>sum+value,0);
  let unknownMass=0;
  const bySymbol=new Map<string,number>();
  for(const [index,item] of rawScores.entries()){
    const value=weights[index]/total;
    if(item.symbolId&&symbolById(item.symbolId)){
      bySymbol.set(item.symbolId,(bySymbol.get(item.symbolId)??0)+value);
    }else unknownMass+=value;
  }
  const ranked=[...bySymbol].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([symbolId,rankScore])=>({
    source:'model' as const,symbolId,rankScore,...(calibrated&&{calibratedConfidence:rankScore}),
  }));
  return {ranked,unknownMass};
}
function qualifies(snapshot:InkSnapshot,inference:InkInferenceResult,q:InkQualification|undefined):q is InkQualification {
  return !!q&&q.assetSetVersion===snapshot.assetSetVersion&&q.outputClassCount===inference.rawScores.length
    &&probability(q.minimumConfidence)&&q.minimumConfidence>=.5
    &&probability(q.minimumMargin)&&q.minimumMargin>0&&probability(q.maximumUnknownMass)&&q.maximumUnknownMass<.5
    &&Number.isFinite(q.temperature)&&q.temperature>0
    &&Number.isSafeInteger(q.heldOut.writers)&&q.heldOut.writers>=2
    &&Number.isSafeInteger(q.heldOut.devices)&&q.heldOut.devices>=2
    &&passesInkReleaseRate(q.heldOut.accepted,q.heldOut.errors);
}

/** Raw confidence can rank choices. Only independent completion evidence and valid calibration can clear both gates. */
export function decideRecognition(snapshot:InkSnapshot,inference:InkInferenceResult|undefined,partial:PartialMatch,
  qualification?:InkQualification):InkResult {
  const {target,sessionId,inkEpoch,inkRevision,sampledAtMs,assetSetVersion}=snapshot;
  const current=inference&&sameInkSnapshot(snapshot,inference)&&sampledAtMs===inference.sampledAtMs?inference:undefined;
  const qualified=current&&qualifies(snapshot,current,qualification)?qualification:undefined;
  const {ranked,unknownMass}=current?readScores(current,qualified?.temperature??1,Boolean(qualified)):noScores;
  const leading=ranked[0],runnerUp=ranked[1]?.rankScore??0;
  const usable=Boolean(leading&&leading.rankScore>=.06&&snapshot.strokes.length&&!snapshot.overBudget);
  const geometry=snapshot.overBudget?[]:partial.exactMatches?.filter(item=>symbolById(item.symbolId))??[];
  const modelMatches=usable?ranked.filter(item=>item.rankScore>0):[];
  const recognized:InkRecognized[]=[...geometry,...modelMatches.filter(item=>!geometry.some(match=>match.symbolId===item.symbolId))].slice(0,5);
  const clear=Boolean(!geometry.length&&usable&&qualified&&qualified.qualifiedSymbols.includes(leading.symbolId)
    &&leading.rankScore>=qualified.minimumConfidence&&leading.rankScore-runnerUp>=qualified.minimumMargin
    &&unknownMass<=qualified.maximumUnknownMass);
  const possibleCompletions=snapshot.overBudget?[]:partial.possibleCompletions.filter(item=>symbolById(item.symbolId));
  const completionDecision=possibleCompletions.length?'extendable'
    :partial.completionDecision==='finished'&&partial.finishedSymbols.length===1&&recognized[0]?.symbolId===partial.finishedSymbols[0]
      ?'finished':'unknown';
  return {
    target,sessionId,inkEpoch,inkRevision,sampledAtMs,assetSetVersion,recognized,possibleCompletions,
    identityDecision:clear?'clear':recognized.length?'uncertain':'unknown',completionDecision,
    qualifiedForAuto:clear&&completionDecision==='finished'&&recognized[0]?.source==='model',
  };
}

export function classifyInkResult(snapshot:InkSnapshot,result:InkSnapshotIdentity,options:{
  nowMs:number;activePointer:number|null;previousPreviewRevision?:number;previousResultRevision?:number;maxPreviewAgeMs?:number;
}):'exact'|'preview'|'stale' {
  if(!sameInkEpoch(snapshot,result)||!Number.isSafeInteger(result.inkRevision)
    ||result.inkRevision<0||result.inkRevision>snapshot.inkRevision
    ||result.inkRevision<=(options.previousResultRevision??-1))return 'stale';
  if(result.inkRevision===snapshot.inkRevision)return 'exact';
  const age=options.nowMs-result.sampledAtMs;
  const previewLimit=Math.min(1000,options.maxPreviewAgeMs??240);
  if(options.activePointer!==null&&result.inkRevision>(options.previousPreviewRevision??-1)
    &&Number.isFinite(age)&&age>=0&&age<=previewLimit)return 'preview';
  return 'stale';
}

type EditorGuard={activePointer:number|null;readOnly:boolean;composing:boolean};
export function canAutoInsert(snapshot:InkSnapshot,result:InkResult,options:EditorGuard&{enabled:boolean;choiceLocked:boolean}) {
  return options.enabled&&!options.choiceLocked&&options.activePointer===null&&!options.readOnly&&!options.composing
    &&sameInkSnapshot(snapshot,result)&&snapshot.completedRevision===snapshot.inkRevision
    &&!snapshot.overBudget&&!snapshot.interrupted&&result.qualifiedForAuto
    &&result.identityDecision==='clear'&&result.completionDecision==='finished'&&result.recognized[0]?.source==='model';
}
export function canAcceptInkCandidate(snapshot:InkSnapshot,result:InkResult,id:string,options:EditorGuard) {
  return options.activePointer===null&&!options.readOnly&&!options.composing&&sameInkSnapshot(snapshot,result)
    &&!!symbolById(id)&&(result.recognized.some(item=>item.symbolId===id)
      ||result.possibleCompletions.some(item=>item.symbolId===id));
}
