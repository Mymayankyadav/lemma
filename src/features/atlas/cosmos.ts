import type {AtlasGraph,ConceptLevel} from '../../data/types';

export type Status=AtlasGraph['concepts'][number]['status'];
export type Body=AtlasGraph['concepts'][number]&{
 level:ConceptLevel; parentId:string|null; children:string[];
 x:number;y:number;radius:number; total:number;done:number;
};
export interface Cosmos {roots:string[]; bodies:Map<string,Body>; links:AtlasGraph['links'];}
export interface Bounds {minX:number;minY:number;maxX:number;maxY:number}
export interface Camera{x:number;y:number;k:number}

const radii:Record<ConceptLevel,number>={cluster:280,galaxy:100,system:44,planet:18,moon:7};
const orbit:Record<ConceptLevel,number>={cluster:600,galaxy:188,system:70,planet:33,moon:13};
const levels:ConceptLevel[]=['cluster','galaxy','system','planet','moon'];
export const levelLabel=(level:ConceptLevel)=>({cluster:'Field',galaxy:'Area',system:'Topic',planet:'Idea',moon:'Supporting idea'})[level];
const isTest=(s:string)=>/zz[-_ ]?selftest|self[-_ ]test|^system([-_ ]|$)/i.test(s);
const emptyRefs:Body['checkpointRefs']=[];
function synthetic(id:string,name:string,subjectId:string,level:ConceptLevel,parentId:string|null):Body{
 return {id,slug:id,name,subjectId,level,parentId,children:[],x:0,y:0,radius:radii[level],
  total:0,done:0,status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:emptyRefs,dueCards:0};
}
function childOrder(a:Body,b:Body){return a.name.localeCompare(b.name)||a.id.localeCompare(b.id)}
/** One owner-safe forest: subjects are the roots even when a legacy data source has no hierarchy. */
export function buildCosmos(graph:AtlasGraph):Cosmos{
 const subjects=[...graph.subjects].filter(s=>!isTest(s.name)&&!isTest(s.id)).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name));
 const permitted=new Set(subjects.map(s=>s.id)),bodies=new Map<string,Body>();
 for(const c of graph.concepts){
  if(!permitted.has(c.subjectId)||isTest(c.id)||isTest(c.name))continue;
  const level:ConceptLevel=levels.includes(c.level as ConceptLevel)?c.level!:'planet';
  bodies.set(c.id,{...c,level,parentId:c.parentId??null,children:[],x:0,y:0,radius:radii[level],total:0,done:0});
 }
 const roots:string[]=[];
 const rootsBySubject=new Map<string,string>();
 for(const subject of subjects){
  const cluster=[...bodies.values()].find(b=>b.subjectId===subject.id&&b.level==='cluster');
  const id=cluster?.id??'atlas:cluster:'+subject.id;
  if(!cluster)bodies.set(id,synthetic(id,subject.name,subject.id,'cluster',null));
  roots.push(id);rootsBySubject.set(subject.id,id);
 }
 for(const body of bodies.values()){
  if(body.level==='cluster'){body.parentId=null;continue;}
  const parent=body.parentId?bodies.get(body.parentId):undefined;
  if(parent&&parent.id!==body.id&&parent.subjectId===body.subjectId&&levels.indexOf(parent.level)<levels.indexOf(body.level))continue;
  // Legacy flat concepts are organised by topic, not thrown into one enormous ring.
  if(body.level==='planet'||body.level==='moon'){
   const root=rootsBySubject.get(body.subjectId)!;
   const key='atlas:system:'+body.subjectId+':'+(body.topic?.trim()||'General');
   if(!bodies.has(key))bodies.set(key,synthetic(key,body.topic?.trim()||'General',body.subjectId,'system',root));
   body.parentId=key;
  }else body.parentId=rootsBySubject.get(body.subjectId)!;
 }
 // Link only after all synthetic parents have been created.
 for(const body of bodies.values())if(body.parentId)bodies.get(body.parentId)?.children.push(body.id);
 for(const body of bodies.values())body.children.sort((a,b)=>childOrder(bodies.get(a)!,bodies.get(b)!));
 const locate=(id:string,x:number,y:number,seen:Set<string>)=>{
  if(seen.has(id))return;seen.add(id);
  const body=bodies.get(id)!;body.x=x;body.y=y;
  for(let i=0;i<body.children.length;i++){
   const child=bodies.get(body.children[i])!;
   const theta=(2*Math.PI*i/Math.max(1,body.children.length))-Math.PI/2;
   const distance=body.children.length===1?0:orbit[child.level];
   locate(child.id,x+Math.cos(theta)*distance,y+Math.sin(theta)*distance,seen);
  }
 };
 const seen=new Set<string>();
 for(let i=0;i<roots.length;i++){
  const theta=2*Math.PI*i/Math.max(roots.length,1)-Math.PI/2;
  locate(roots[i],roots.length===1?0:Math.cos(theta)*orbit.cluster,
   roots.length===1?0:Math.sin(theta)*orbit.cluster,seen);
 }
 const progress=(id:string):{total:number;done:number}=>{
  const b=bodies.get(id)!;
  if(!b.children.length){
   const isIdea=b.level==='planet'||b.level==='moon';
   b.total=isIdea?1:0;b.done=isIdea&&b.status==='demonstrated'?1:0;
  }else{
   const child=b.children.map(progress);
   b.total=child.reduce((n,v)=>n+v.total,0);b.done=child.reduce((n,v)=>n+v.done,0);
   if(b.total)b.status=b.done===b.total?'demonstrated':child.some(v=>v.done>0)?'in_progress':'not_started';
  }
  return {total:b.total,done:b.done};
 };
 for(const root of roots)progress(root);
 return {roots,bodies,links:graph.links.filter(e=>bodies.has(e.fromId)&&bodies.has(e.toId))};
}
export function ancestry(model:Cosmos,id:string|null):Body[]{
 const path:Body[]=[],seen=new Set<string>();let current=id;
 while(current&&!seen.has(current)){
  seen.add(current);const b=model.bodies.get(current);if(!b)break;path.unshift(b);current=b.parentId;
 }
 return path;
}
export function childrenOf(model:Cosmos,parentId:string|null):Body[]{
 return (parentId?[...model.bodies.get(parentId)?.children??[]]:model.roots).map(id=>model.bodies.get(id)!).filter(Boolean);
}
export function area(nodes:readonly Pick<Body,'x'|'y'|'radius'>[],padding=24):Bounds{
 if(!nodes.length)return {minX:-1,minY:-1,maxX:1,maxY:1};
 return {minX:Math.min(...nodes.map(n=>n.x-n.radius))-padding,minY:Math.min(...nodes.map(n=>n.y-n.radius))-padding,
  maxX:Math.max(...nodes.map(n=>n.x+n.radius))+padding,maxY:Math.max(...nodes.map(n=>n.y+n.radius))+padding};
}
export function fit(bounds:Bounds,width:number,height:number,margin=24):Camera{
 const k=Math.min((width-2*margin)/Math.max(1,bounds.maxX-bounds.minX),
   (height-2*margin)/Math.max(1,bounds.maxY-bounds.minY));
 const scale=Math.max(1e-9,k);
 return {x:width/2-(bounds.minX+bounds.maxX)/2*scale,y:height/2-(bounds.minY+bounds.maxY)/2*scale,k:scale};
}
/** Camera and minimap use the same isotropic scale: never distort circles into ellipses. */
export function miniProjection(bounds:Bounds,size=96,pad=5){
 const k=Math.min((size-pad*2)/Math.max(1,bounds.maxX-bounds.minX),
   (size-pad*2)/Math.max(1,bounds.maxY-bounds.minY));
 return {k,x:size/2-(bounds.minX+bounds.maxX)/2*k,y:size/2-(bounds.minY+bounds.maxY)/2*k};
}
export function projectedViewport(camera:Camera,width:number,height:number,projection:Camera){
 return {x:projection.x-camera.x/camera.k*projection.k,
  y:projection.y-camera.y/camera.k*projection.k,
  width:width/camera.k*projection.k,height:height/camera.k*projection.k};
}
export function isOnScreen(b:Body,camera:Camera,width:number,height:number){
 const x=camera.x+b.x*camera.k,y=camera.y+b.y*camera.k,r=Math.max(22,b.radius*camera.k);
 return x+r>=0&&x-r<=width&&y+r>=0&&y-r<=height;
}
