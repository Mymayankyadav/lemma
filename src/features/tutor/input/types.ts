export type InkPoint = Readonly<{x:number;y:number;t:number;pressure?:number}>;
export type InkStroke = Readonly<{
  pointerType:'mouse'|'pen'|'touch'|'unknown';
  points:readonly InkPoint[];
}>;
export type InkViewport=Readonly<{width:number;height:number}>;

export type EditTarget=Readonly<{
  scopeKey:string;
  mountId:string;
  editorRevision:number;
  selectionRevision:number;
  modeRevision:number;
}>;

export type InkPhase='idle'|'drawing'|'recognizing'|'choice_required'|'awaiting_more_ink'|'paused'|'committing';
export type InkReadiness='unloaded'|'loading'|'ready'|'unavailable';

export interface InkSnapshotIdentity {
  readonly target:EditTarget;
  readonly sessionId:string;
  readonly inkEpoch:number;
  readonly inkRevision:number;
  readonly sampledAtMs:number;
  readonly assetSetVersion:string;
}
export interface InkSnapshot extends InkSnapshotIdentity {
  readonly strokes:readonly InkStroke[];
  readonly viewport:InkViewport;
  readonly overBudget:boolean;
  readonly interrupted:boolean;
  readonly completedRevision:number|null;
}
export interface InkInferenceResult extends InkSnapshotIdentity {
  readonly rawScores:readonly {classId:string;score:number;symbolId?:string}[];
  readonly scoreKind:'probability'|'logit';
}
export type InkModelRecognized=Readonly<{source:'model';symbolId:string;rankScore:number;calibratedConfidence?:number}>;
export type InkGeometryRecognized=Readonly<{source:'geometry';symbolId:string;geometryScore:number;calibratedConfidence?:never}>;
export type InkRecognized=InkModelRecognized|InkGeometryRecognized;
export type InkCompletion=Readonly<{symbolId:string;extensionScore:number;requiresExplicitSelection:true}>;
export type InkIdentityDecision='clear'|'uncertain'|'unknown';
export type InkCompletionDecision='finished'|'extendable'|'unknown';
export interface InkResult extends InkSnapshotIdentity {
  readonly recognized:readonly InkRecognized[];
  readonly possibleCompletions:readonly InkCompletion[];
  readonly identityDecision:InkIdentityDecision;
  readonly completionDecision:InkCompletionDecision;
  readonly qualifiedForAuto:boolean;
}
