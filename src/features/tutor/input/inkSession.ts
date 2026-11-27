import type {EditTarget,InkPhase,InkPoint,InkSnapshot,InkStroke,InkViewport} from './types';
import {resampleInkPath} from './inkGeometry';

/** A single symbol buffer. Reaching a limit always disqualifies the drawing from automatic insertion. */
export const INK_LIMITS=Object.freeze({strokes:12,pointsPerStroke:192});
const positiveViewport=(viewport:InkViewport)=>Number.isFinite(viewport.width)&&Number.isFinite(viewport.height)
  &&viewport.width>0&&viewport.height>0;

function sanitizedPoint(point:InkPoint,viewport:InkViewport,previous?:InkPoint):InkPoint|undefined {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.t))return;
  return {
    x:Math.max(0,Math.min(viewport.width,point.x)),
    y:Math.max(0,Math.min(viewport.height,point.y)),
    t:Math.max(previous?.t??0,point.t),
    ...(point.pressure!==undefined&&Number.isFinite(point.pressure)
      ?{pressure:Math.max(0,Math.min(1,point.pressure))}:{}),
  };
}

export class InkSession {
  activePointer:number|null=null;
  explicitChoiceLocked=false;
  phase:InkPhase='idle';
  private strokes:readonly InkStroke[]=[];
  private revision=0;
  private epoch=0;
  private completedRevision:number|null=null;
  private interrupted=false;
  private overBudget=false;
  private trackingStroke=false;
  private locks=0;
  private locksAtStart=0;
  private target:EditTarget;
  private viewport:InkViewport;

  constructor(target:EditTarget,private readonly sessionId:string,private readonly assetSetVersion:string,viewport:InkViewport) {
    this.target={...target};
    this.viewport=positiveViewport(viewport)?{...viewport}:{width:1,height:1};
  }
  private mutate(newEpoch=false) {
    this.revision++;
    if(newEpoch)this.epoch++;
    this.completedRevision=null;
  }
  begin(pointerId:number,pointerType:InkStroke['pointerType'],point:InkPoint) {
    if(this.phase==='paused'||this.phase==='committing')return false;
    if(this.activePointer!==null){
      if(pointerId!==this.activePointer){
        this.interrupted=true;
        this.mutate(true);
      }
      return false;
    }
    const at=sanitizedPoint(point,this.viewport,this.strokes.at(-1)?.points.at(-1));
    if(!at){this.interrupted=true;this.mutate(true);return false;}
    this.activePointer=pointerId;
    this.locksAtStart=this.locks;
    this.phase='drawing';
    this.trackingStroke=this.strokes.length<INK_LIMITS.strokes;
    if(this.trackingStroke)this.strokes=[...this.strokes,{pointerType,points:[at]}];
    else this.overBudget=true;
    this.mutate();
    return true;
  }
  private append(point:InkPoint) {
    const last=this.strokes.at(-1);
    const at=sanitizedPoint(point,this.viewport,last?.points.at(-1));
    if(!at){
      this.interrupted=true;
      this.mutate(true);
      return false;
    }
    if(this.trackingStroke&&last){
      let points=[...last.points,at];
      if(points.length>INK_LIMITS.pointsPerStroke){
        points=resampleInkPath(points,Math.floor(INK_LIMITS.pointsPerStroke*.75));
        this.overBudget=true;
        this.mutate(true);
      }else this.mutate();
      this.strokes=[...this.strokes.slice(0,-1),{...last,points}];
    }else this.mutate();
    return true;
  }
  move(pointerId:number,point:InkPoint) {
    if(pointerId!==this.activePointer)return false;
    return this.append(point);
  }
  end(pointerId:number,point:InkPoint) {
    if(pointerId!==this.activePointer)return false;
    const valid=this.append(point);
    this.activePointer=null;
    this.trackingStroke=false;
    if(valid&&!this.interrupted){
      this.completedRevision=this.revision;
      if(this.locks===this.locksAtStart)this.explicitChoiceLocked=false;
    }
    this.phase=this.strokes.length?'recognizing':'idle';
    return true;
  }
  interrupt(pointerId?:number) {
    if(pointerId!==undefined&&pointerId!==this.activePointer)return false;
    if(this.activePointer!==null)this.interrupted=true;
    this.activePointer=null;
    this.trackingStroke=false;
    this.mutate(true);
    this.phase=this.strokes.length?'recognizing':'idle';
    return true;
  }
  undo() {
    this.activePointer=null;
    this.trackingStroke=false;
    this.strokes=this.strokes.slice(0,-1);
    this.mutate(true);
    this.phase=this.strokes.length?'recognizing':'idle';
  }
  clear() {
    this.activePointer=null;
    this.trackingStroke=false;
    this.strokes=[];
    this.interrupted=false;
    this.overBudget=false;
    this.mutate(true);
    this.phase='idle';
  }
  /** Import the completed, scaled equation paper atomically. Null denotes more than one symbol's budget. */
  replacePaperInk(paths:readonly (readonly InkPoint[])[]|null) {
    this.clear();
    if (!paths || paths.length>INK_LIMITS.strokes) this.overBudget=true;
    else for (const [id,path] of paths.entries()) {
      if (!path.length) continue;
      this.begin(id,'pen',path[0]);
      for (let i=1;i<path.length-1;i++) this.move(id,path[i]);
      this.end(id,path[path.length-1]);
    }
    // Paper suggestions are manual, even when live single-symbol auto-insert is enabled.
    this.lockChoice();
  }
  cancel() {
    this.clear();
    this.phase='paused';
  }
  lockChoice() {
    this.explicitChoiceLocked=true;
    this.locks++;
  }
  pause() {
    this.interrupt();
    this.phase='paused';
  }
  resume(target:EditTarget) {
    this.target={...target};
    this.mutate(true);
    this.phase=this.strokes.length?'recognizing':'idle';
  }
  resize(viewport:InkViewport) {
    if(!positiveViewport(viewport)||viewport.width===this.viewport.width&&viewport.height===this.viewport.height)return false;
    const old=this.viewport;
    const scale=Math.min(viewport.width/old.width,viewport.height/old.height);
    const dx=(viewport.width-old.width*scale)/2,dy=(viewport.height-old.height*scale)/2;
    this.viewport={...viewport};
    this.strokes=this.strokes.map(stroke=>({...stroke,points:stroke.points.map(point=>
      ({...point,x:point.x*scale+dx,y:point.y*scale+dy}))}));
    this.interrupted=this.activePointer!==null||this.interrupted;
    this.mutate(true);
    return true;
  }
  snapshot(sampledAtMs:number):InkSnapshot {
    return {
      target:this.target,sessionId:this.sessionId,inkEpoch:this.epoch,inkRevision:this.revision,sampledAtMs,
      assetSetVersion:this.assetSetVersion,strokes:this.strokes,viewport:this.viewport,overBudget:this.overBudget,
      interrupted:this.interrupted,completedRevision:this.completedRevision,
    };
  }
}
