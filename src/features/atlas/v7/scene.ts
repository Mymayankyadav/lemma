import type {LayoutResult} from './layout';
import type {AtlasModel,StarState} from './model';
import {roomLabelSpot} from './roomLabels';

/**
 * Canvas renderer for the v7 Atlas sky (PLAN §6.12). It draws only what is in view,
 * reuses one pre-rendered sprite per star look (glows are drawn once), and keeps all
 * colours in a palette read from the role tokens, so Day and Night differ in values only.
 */
export interface Camera{x:number; y:number; k:number}
export interface Insets{top:number; right:number; bottom:number; left:number}
export interface ScenePalette{
 night:boolean; sky:string; grid:string; dust:string; text:string; textSecondary:string; mark:string;
 link:string; selection:string; focus:string; warning:string; subjects:string[]; sans:string;
}
export const MIN_ZOOM=.2,MAX_ZOOM=4;
/** Below this only constellation names and the largest stars are labelled. */
export const FAR_ZOOM=.7;
/** At and above this the selected star shows its checkpoints and cards as satellites. */
export const NEAR_ZOOM=1.6;
const GRID=24,DUST=120,HIT_SLOP=22;

type Ctx=CanvasRenderingContext2D&{letterSpacing?:string};
interface Sprite{canvas:HTMLCanvasElement; half:number}

function seeded(seed:number):()=>number{let a=seed|0;return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
function starPath(ctx:CanvasRenderingContext2D,cx:number,cy:number,outer:number,inner:number){
 ctx.beginPath();
 for(let i=0;i<10;i++){const r=i%2?inner:outer,a=-Math.PI/2+i*Math.PI/5;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
 ctx.closePath();
}
/** One drawn mark per state, so state is readable without colour (shape before hue). */
export function drawStarMark(ctx:CanvasRenderingContext2D,state:StarState,cx:number,cy:number,r:number,colour:string,palette:ScenePalette){
 ctx.lineWidth=1.5;
 switch(state){
 case 'demonstrated':
  starPath(ctx,cx,cy,r*1.45,r*.62);ctx.fillStyle=colour;ctx.fill();break;
 case 'in_progress':
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle=colour;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r-1.5,Math.PI/2,Math.PI*1.5);ctx.closePath();ctx.fillStyle=colour;ctx.fill();break;
 case 'up_next':
  starPath(ctx,cx,cy,r*1.35,r*.6);ctx.strokeStyle=palette.text;ctx.lineWidth=1.25;ctx.stroke();break;
 case 'revisit':
  {const radius=Math.max(3.5,r),start=-Math.PI*.35,end=start+Math.PI*1.65;
   ctx.beginPath();ctx.arc(cx,cy,radius,start,end);ctx.strokeStyle=palette.warning;ctx.lineWidth=1.75;ctx.lineCap='round';ctx.stroke();
   const hx=cx+Math.cos(end)*radius,hy=cy+Math.sin(end)*radius,tx=-Math.sin(end),ty=Math.cos(end),head=Math.max(2.5,radius*.55);
   ctx.beginPath();ctx.moveTo(hx+tx*head,hy+ty*head);ctx.lineTo(hx,hy);ctx.lineTo(hx+(Math.cos(end)*head),hy+(Math.sin(end)*head));ctx.stroke();ctx.lineCap='butt';}
  break;
 default:
  ctx.beginPath();ctx.arc(cx,cy,Math.max(3,r*.7),0,Math.PI*2);ctx.strokeStyle=palette.mark;ctx.lineWidth=1;ctx.stroke();
 }
}

export class AtlasScene{
 labelCluster:number|null=null;
 highlighted:ReadonlySet<number>|null=null;
 camera:Camera={x:0,y:0,k:1};
 selected:number|null=null;
 private ctx:Ctx;
 private width=1; private height=1; private dpr=1;
 private insets:Insets={top:0,right:0,bottom:0,left:0};
 private sprites=new Map<string,Sprite>();
 private dust:[number,number,number,number][];
 private visible:number[]=[];
 private extent:number[];
 private topLabels:Set<number>;
 private neighbourSet=new Set<number>();
 constructor(private canvas:HTMLCanvasElement,private model:AtlasModel,private layout:LayoutResult,private palette:ScenePalette){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas 2D is unavailable');
  this.ctx=ctx as Ctx;
  const random=seeded(7);
  this.dust=Array.from({length:DUST},()=>[random(),random(),.4+random()*.35,.1+random()*.2]);
  // Each constellation's reach (for its tint) and its two or three largest stars (labelled when far).
  this.extent=layout.centres.map(()=>0);
  const byCluster=new Map<number,number[]>();
  model.stars.forEach((star,i)=>{
   const [cx,cy]=layout.centres[star.cluster]??[0,0];
   this.extent[star.cluster]=Math.max(this.extent[star.cluster]??0,Math.hypot(layout.x[i]-cx,layout.y[i]-cy));
   byCluster.set(star.cluster,[...(byCluster.get(star.cluster)??[]),i]);
  });
  this.topLabels=new Set([...byCluster.values()].flatMap(members=>members.sort((a,b)=>model.stars[b].radius-model.stars[a].radius||a-b).slice(0,members.length>12?3:2)));
 }
 setPalette(palette:ScenePalette){this.palette=palette;this.sprites.clear();}
 setInsets(insets:Insets){this.insets=insets;}
 setSize(width:number,height:number,dpr:number){
  this.width=Math.max(1,width);this.height=Math.max(1,height);
  if(dpr!==this.dpr)this.sprites.clear();
  this.dpr=dpr;
  this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);
 }
 select(index:number|null){this.selected=index;this.neighbourSet=new Set(index===null?[]:this.model.neighbours[index]);}
 /** The view centre, offset for the glass header and the sheet. */
 private centre():[number,number]{return [this.insets.left+(this.width-this.insets.left-this.insets.right)/2,this.insets.top+(this.height-this.insets.top-this.insets.bottom)/2];}
 toScreen(x:number,y:number):[number,number]{const [cx,cy]=this.centre();return [(x-this.camera.x)*this.camera.k+cx,(y-this.camera.y)*this.camera.k+cy];}
 toWorld(sx:number,sy:number):[number,number]{const [cx,cy]=this.centre();return [(sx-cx)/this.camera.k+this.camera.x,(sy-cy)/this.camera.k+this.camera.y];}
 /** Camera that frames every star. */
 fitCamera():Camera{
  // AT2: fit every star, its first-view label and every constellation name inside the viewport with 24 px of padding.
  // Labels are drawn in screen pixels, so the fit searches for the largest zoom whose screen extent fits.
  const pad=24,availW=Math.max(1,this.width-this.insets.left-this.insets.right-pad*2),availH=Math.max(1,this.height-this.insets.top-this.insets.bottom-pad*2);
  const {model,layout}=this;
  const extent=(k:number)=>{
   let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
   model.stars.forEach((star,i)=>{
    const x=layout.x[i]*k,y=layout.y[i]*k,r=star.radius*1.6+2,label=this.topLabels.has(i)?Math.min(32,star.label.length)*6.6+8:0;
    left=Math.min(left,x-r);right=Math.max(right,x+r+label);top=Math.min(top,y-r);bottom=Math.max(bottom,y+r);
   });
   layout.centres.forEach(([cx,cy],cluster)=>{
    const info=model.clusters.find(entry=>entry.index===cluster);if(!info)return;
    const w=info.name.length*9.6/2,x=cx*k,y=(cy-(this.extent[cluster]??0)-18)*k;
    left=Math.min(left,x-w);right=Math.max(right,x+w);top=Math.min(top,y-10);
   });
   if(!Number.isFinite(left)){left=right=top=bottom=0;}
   return {left,right,top,bottom};
  };
  let lo=MIN_ZOOM,hi=MAX_ZOOM;
  for(let n=0;n<24;n++){const k=(lo+hi)/2,e=extent(k);if(e.right-e.left<=availW&&e.bottom-e.top<=availH)lo=k;else hi=k;}
  const k=lo,e=extent(k);
  return {x:(e.left+e.right)/2/k,y:(e.top+e.bottom)/2/k,k};
 }
 /** Camera centred on one star, close enough to read its neighbourhood. */
 focusCamera(index:number,k=Math.max(this.camera.k,1.4)):Camera{return {x:this.layout.x[index],y:this.layout.y[index],k:Math.min(MAX_ZOOM,k)};}
 /** U3: frame one subject with room for every concept label, instead of fitting the whole sky on a phone. */
 clusterCamera(cluster:number):Camera{
  const members=this.model.stars.map((star,i)=>star.cluster===cluster?i:-1).filter(i=>i>=0);
  if(!members.length)return this.fitCamera();
  const left=Math.min(...members.map(i=>this.layout.x[i])),right=Math.max(...members.map(i=>this.layout.x[i]));
  const top=Math.min(...members.map(i=>this.layout.y[i])),bottom=Math.max(...members.map(i=>this.layout.y[i]));
  const label=Math.min(210,Math.max(...members.map(i=>this.model.stars[i].label.length))*7);
  const width=Math.max(40,this.width-this.insets.left-this.insets.right-label-48),height=Math.max(40,this.height-this.insets.top-this.insets.bottom-80);
  const k=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,width/Math.max(1,right-left+24),height/Math.max(1,bottom-top+24)));
  return {x:(left+right)/2+label/2/k,y:(top+bottom)/2,k};
 }
 /** Zoom around a screen point, keeping that point still. */
 zoomCamera(sx:number,sy:number,factor:number,from:Camera=this.camera):Camera{
  const k=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,from.k*factor));
  const [cx,cy]=this.centre(),wx=(sx-cx)/from.k+from.x,wy=(sy-cy)/from.k+from.y;
  return {x:wx-(sx-cx)/k,y:wy-(sy-cy)/k,k};
 }
 hitTest(sx:number,sy:number):number|null{
  let best:number|null=null,bestDistance=Infinity;
  for(const i of this.visible){
   const [x,y]=this.toScreen(this.layout.x[i],this.layout.y[i]),d=Math.hypot(x-sx,y-sy);
   if(d<=Math.max(HIT_SLOP,this.model.stars[i].radius*this.camera.k+8)&&d<bestDistance){best=i;bestDistance=d;}
  }
  return best;
 }
 private colour(cluster:number){return this.palette.subjects[cluster]??this.palette.textSecondary;}
 private sprite(i:number):Sprite{
  const star=this.model.stars[i],colour=this.colour(star.cluster),r=star.radius;
  const key=star.state+'|'+colour+'|'+r.toFixed(2)+'|'+(this.palette.night?1:0);
  let sprite=this.sprites.get(key);
  if(sprite)return sprite;
  const glow=this.palette.night&&star.state==='demonstrated'?6:0,half=Math.ceil(r*1.6+glow+3);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=Math.ceil(half*2*this.dpr);
  const ctx=canvas.getContext('2d');
  if(ctx){
   ctx.scale(this.dpr,this.dpr);
   if(glow){ctx.save();ctx.shadowColor=colour;ctx.shadowBlur=glow;ctx.globalAlpha=.3;drawStarMark(ctx,star.state,half,half,r,colour,this.palette);ctx.restore();}
   drawStarMark(ctx,star.state,half,half,r,colour,this.palette);
  }
  sprite={canvas,half};this.sprites.set(key,sprite);
  return sprite;
 }
 draw(){
  const {ctx,model,layout,palette,camera}=this;
  const selected=this.selected,dimmed=selected!==null;
  ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  ctx.globalAlpha=1;ctx.fillStyle=palette.sky;ctx.fillRect(0,0,this.width,this.height);
  this.drawSky();
  const [x0,y0]=this.toWorld(-40,-40),[x1,y1]=this.toWorld(this.width+40,this.height+40);
  // Constellation tints and names.
  layout.centres.forEach(([cx,cy],cluster)=>{
   const reach=(this.extent[cluster]??0)+48,[sx,sy]=this.toScreen(cx,cy),radius=reach*camera.k;
   if(sx+radius<0||sy+radius<0||sx-radius>this.width||sy-radius>this.height)return;
   const gradient=ctx.createRadialGradient(sx,sy,0,sx,sy,radius);
   gradient.addColorStop(0,this.colour(cluster));gradient.addColorStop(1,'transparent');
   ctx.globalAlpha=palette.night?.1:.06;ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();
  });
  ctx.globalAlpha=1;
  // Links: prerequisite = solid with an arrowhead at the dependent concept; related = dotted.
  for(const edge of model.edges){
   const ax=layout.x[edge.from],ay=layout.y[edge.from],bx=layout.x[edge.to],by=layout.y[edge.to];
   if(Math.max(ax,bx)<x0||Math.min(ax,bx)>x1||Math.max(ay,by)<y0||Math.min(ay,by)>y1)continue;
   const active=selected!==null&&(edge.from===selected||edge.to===selected);
   const [sx,sy]=this.toScreen(ax,ay),[ex,ey]=this.toScreen(bx,by),length=Math.hypot(ex-sx,ey-sy);
   if(length<1)continue;
   const ux=(ex-sx)/length,uy=(ey-sy)/length,startGap=model.stars[edge.from].radius*camera.k+3,endGap=model.stars[edge.to].radius*camera.k+4;
   if(length<=startGap+endGap)continue;
   ctx.globalAlpha=active?1:dimmed?.4*.6:.6;ctx.strokeStyle=active?palette.selection:palette.link;ctx.lineWidth=active?1.5:1;
   ctx.setLineDash(edge.kind==='related'?[2,3]:[]);
   const tx=ex-ux*endGap,ty=ey-uy*endGap;
   ctx.beginPath();ctx.moveTo(sx+ux*startGap,sy+uy*startGap);ctx.lineTo(tx,ty);ctx.stroke();
   if(edge.kind==='prereq'&&(active||camera.k>=NEAR_ZOOM)){
    ctx.setLineDash([]);const head=active?6:5;
    ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-ux*head-uy*head*.55,ty-uy*head+ux*head*.55);ctx.lineTo(tx-ux*head+uy*head*.55,ty-uy*head-ux*head*.55);ctx.closePath();
    ctx.fillStyle=ctx.strokeStyle;ctx.fill();
   }
  }
  ctx.setLineDash([]);
  // Stars in view.
  const visible:number[]=[];
  for(let i=0;i<model.stars.length;i++){
   const x=layout.x[i],y=layout.y[i];
   if(x<x0||x>x1||y<y0||y>y1)continue;
   visible.push(i);
  }
  this.visible=visible;
  const scale=Math.min(1.6,Math.max(.75,Math.sqrt(camera.k)));
  for(const i of visible){
   const sprite=this.sprite(i),[sx,sy]=this.toScreen(layout.x[i],layout.y[i]),half=sprite.half*scale;
   ctx.globalAlpha=this.highlighted&&!this.highlighted.has(i)?.15:dimmed&&i!==selected&&!this.neighbourSet.has(i)?.4:1;
   ctx.drawImage(sprite.canvas,sx-half,sy-half,half*2,half*2);
  }
  ctx.globalAlpha=1;
  if(selected!==null&&visible.includes(selected))this.drawSelection(selected,scale);
  this.drawLabels(visible,scale);
 }
 private drawSky(){
  const {ctx,palette,camera}=this;
  if(palette.night){
   ctx.fillStyle=palette.dust;
   for(const [u,v,r,a] of this.dust){ctx.globalAlpha=a;ctx.beginPath();ctx.arc(u*this.width,v*this.height,r,0,Math.PI*2);ctx.fill();}
   ctx.globalAlpha=1;return;
  }
  const step=GRID*camera.k;
  if(step<10)return;
  const [ox,oy]=this.toScreen(0,0);
  ctx.globalAlpha=.35;ctx.strokeStyle=palette.grid;ctx.lineWidth=1;ctx.beginPath();
  for(let x=((ox%step)+step)%step;x<this.width;x+=step){ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,this.height);}
  for(let y=((oy%step)+step)%step;y<this.height;y+=step){ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(this.width,Math.round(y)+.5);}
  ctx.stroke();ctx.globalAlpha=1;
 }
 private drawSelection(i:number,scale:number){
  const {ctx,model,layout,palette,camera}=this,star=model.stars[i],[sx,sy]=this.toScreen(layout.x[i],layout.y[i]);
  ctx.strokeStyle=palette.focus;ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx,sy,star.radius*1.6*scale+5,0,Math.PI*2);ctx.stroke();
  if(camera.k<NEAR_ZOOM)return;
  // Closest zoom: checkpoints (squares) and due cards (dots) orbit the selected concept.
  const items=[...star.checkpoints.map(cp=>({kind:'checkpoint' as const,label:cp.code})),...Array.from({length:Math.min(star.due,12)},()=>({kind:'card' as const,label:''}))];
  const orbit=star.radius*1.6*scale+22,colour=this.colour(star.cluster);
  ctx.font='600 11px '+palette.sans;ctx.textAlign='center';ctx.textBaseline='middle';
  items.forEach((item,n)=>{
   const a=-Math.PI/2+n*2*Math.PI/Math.max(items.length,1),x=sx+Math.cos(a)*orbit,y=sy+Math.sin(a)*orbit;
   if(item.kind==='checkpoint'){
    ctx.fillStyle=colour;ctx.fillRect(x-4,y-4,8,8);
    ctx.fillStyle=palette.textSecondary;ctx.fillText(item.label,x,y+(Math.sin(a)>=0?14:-14));
   }else{ctx.fillStyle=colour;ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();}
  });
 }
 private drawLabels(visible:number[],scale:number){
  const {ctx,model,layout,palette,camera}=this,placed:[number,number,number,number][]=[];
  const stars=visible.map(i=>{const [x,y]=this.toScreen(layout.x[i],layout.y[i]),r=model.stars[i].radius*1.6*scale+2;return [x-r,y-r,r*2,r*2] as [number,number,number,number];});
  const fits=(x:number,y:number,w:number,h:number)=>x>=4&&x+w<=this.width-4&&!placed.some(([px,py,pw,ph])=>x<px+pw&&x+w>px&&y<py+ph&&y+h>py)
   &&!stars.some(([px,py,pw,ph])=>x<px+pw&&x+w>px&&y<py+ph&&y+h>py);
  ctx.textBaseline='middle';ctx.textAlign='left';
  const label=(i:number,size:number,weight:number,colour:string,force=false)=>{
   const star=model.stars[i],[sx,sy]=this.toScreen(layout.x[i],layout.y[i]),text=star.label.length>32?star.label.slice(0,31)+'…':star.label;
   ctx.font=weight+' '+size+'px '+palette.sans;
   const w=ctx.measureText(text).width,gap=star.radius*1.6*scale+6;
   // Try right, left, above and below the star before giving up on a label.
   const spots:[number,number,CanvasTextAlign][]=[[sx+gap,sy,'left'],[sx-gap-w,sy,'left'],[sx-w/2,sy-gap-size/2,'left'],[sx-w/2,sy+gap+size/2,'left']];
   const room=force&&this.labelCluster!==null,bounds={x:this.insets.left+8,y:this.insets.top+12,width:this.width-this.insets.left-this.insets.right-16,height:this.height-this.insets.top-this.insets.bottom-24};
   const natural=spots.find(([x,y])=>fits(x,y-size/2-1,w,size+2)&&(!room||(y-size/2>=bounds.y&&y+size/2<=bounds.y+bounds.height)));
   const packed=!natural&&room?roomLabelSpot(spots.map(([x,y])=>[x,y-size/2-1]),w,size+2,bounds,[...placed,...stars].map(([x,y,width,height])=>({x,y,width,height}))):null;
   const spot=natural??(packed?[packed[0],packed[1]+size/2+1] as const:force&&!room?spots[0]:null);
   if(!spot)return;
   const [x,y]=spot;
   if(packed){const alpha=ctx.globalAlpha;ctx.globalAlpha=alpha*.25;ctx.strokeStyle=colour;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(Math.max(x,Math.min(x+w,sx)),y);ctx.stroke();ctx.globalAlpha=alpha;}
   placed.push([x-2,y-size/2-2,w+4,size+4]);ctx.fillStyle=colour;ctx.fillText(text,x,y);
  };
  if(this.selected!==null&&visible.includes(this.selected))label(this.selected,16,600,palette.text,true);
  // Constellation names in wide capitals, above each cluster.
  ctx.font='600 12px '+palette.sans;
  if('letterSpacing' in ctx)ctx.letterSpacing='0.24em';
  layout.centres.forEach(([cx,cy],cluster)=>{
   const info=model.clusters.find(entry=>entry.index===cluster);if(!info)return;
   const [sx,sy]=this.toScreen(cx,cy-(this.extent[cluster]??0)-18),text=info.name.toUpperCase();
   ctx.font='600 12px '+palette.sans;const w=ctx.measureText(text).width;
   if(sx+w/2<0||sx-w/2>this.width||sy<0||sy>this.height)return;
   ctx.globalAlpha=1;ctx.fillStyle=palette.textSecondary;ctx.textAlign='center';ctx.fillText(text,sx,sy);placed.push([sx-w/2,sy-8,w,16]);
  });
  if('letterSpacing' in ctx)ctx.letterSpacing='0px';
  ctx.textAlign='left';
  const dim=this.selected!==null;
  const candidates=(this.labelCluster!==null?visible.filter(i=>model.stars[i].cluster===this.labelCluster):camera.k<FAR_ZOOM?visible.filter(i=>this.topLabels.has(i)):visible)
   .filter(i=>i!==this.selected).sort((a,b)=>model.stars[b].radius-model.stars[a].radius||a-b).slice(0,220);
  for(const i of candidates){ctx.globalAlpha=this.highlighted&&!this.highlighted.has(i)?.2:dim&&!this.neighbourSet.has(i)?.4:1;label(i,12,500,palette.textSecondary,this.labelCluster!==null);}
  ctx.globalAlpha=1;
 }
}
