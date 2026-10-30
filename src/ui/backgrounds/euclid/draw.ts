/* Pure compass/straightedge geometry: circles, supporting rules, then rubric. */
export type Figure='i1'|'i10'|'iii1'|'i2'|'i9'|'ii11'|'i46'|'i47';
export interface Palette{ink:string;accent:string}
export type Drawing=(ctx:CanvasRenderingContext2D,w:number,h:number,t:Palette,progress:number)=>void;
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const phase=(p:number,a:number,b:number)=>clamp((p-a)/(b-a));
function line(c:CanvasRenderingContext2D,x:number,y:number,u:number,v:number,p=1){
 if(p<=0)return;c.beginPath();c.moveTo(x,y);c.lineTo(x+(u-x)*clamp(p),y+(v-y)*clamp(p));c.stroke();
}
function arc(c:CanvasRenderingContext2D,x:number,y:number,r:number,p=1,start=0,angle=Math.PI*2){
 if(p<=0)return;c.beginPath();c.arc(x,y,r,start,start+angle*clamp(p));c.stroke();
}
function draw(c:CanvasRenderingContext2D,w:number,h:number,t:Palette,p:number,kind:Figure){
 c.save();const s=Math.min(w*.2,h*.17,130);
 c.translate(w*.72,h*.32);c.scale(s,s);c.lineWidth=1.2/s;c.strokeStyle=t.ink;c.globalAlpha=.12;
 const circle=phase(p,0,.58),rule=phase(p,.5,.82),red=phase(p,.78,1);
 const rubric=()=>{c.strokeStyle=t.accent;c.globalAlpha=.27};
 if(kind==='i1'){
  const top=-Math.sqrt(3)/2;
  arc(c,-.5,0,1,circle);arc(c,.5,0,1,circle);
  rubric();line(c,-.5,0,.5,0,red);line(c,-.5,0,0,top,red);line(c,.5,0,0,top,red);
 }else if(kind==='i10'){
  const r=.76,intersection=Math.sqrt(r*r-.25);
  arc(c,-.5,0,r,circle,-1.03,2.06);arc(c,.5,0,r,circle,Math.PI-1.03,2.06);
  line(c,-.5,0,.5,0,rule);rubric();line(c,0,-intersection,0,intersection,red);
 }else if(kind==='iii1'){
  const r=.85,chordY=-.4,x=Math.sqrt(r*r-chordY*chordY);
  arc(c,0,0,r,circle);line(c,-x,chordY,x,chordY,rule);
  line(c,-r,0,r,0,rule);line(c,0,-r,0,r,rule);
  rubric();arc(c,0,0,.035,red);
 }else if(kind==='i2'){
  // Equilateral DAB. Extend DB to G and DA to L; BG = AL = BC = .55.
  const dy=.3-.4*Math.sqrt(3),ly=dy+1.35*Math.sqrt(3)/2;
  arc(c,.4,.3,.55,circle);arc(c,0,dy,1.35,circle,Math.PI/6,Math.PI*2/3);
  line(c,-.4,.3,.4,.3,rule);line(c,0,dy,.675,ly,rule);line(c,0,dy,-.675,ly,rule);
  rubric();line(c,.4,.3,.95,.3,red);line(c,-.4,.3,-.675,ly,red);
 }else if(kind==='i9'){
  const r=Math.hypot(.6,.6),intersection=-.2-Math.sqrt(.8*.8-.6*.6);
  arc(c,0,.4,r,circle,-3*Math.PI/4,Math.PI/2);
  arc(c,-.6,-.2,.8,circle,-1.4,1.4);arc(c,.6,-.2,.8,circle,Math.PI,1.4);
  line(c,0,.4,-.85,-.45,rule);line(c,0,.4,.85,-.45,rule);
  rubric();line(c,0,.4,0,intersection,red);
 }else if(kind==='ii11'){
  // A square on AB, E the midpoint of AD. EF = EB and AH = AF.
  const radius=Math.hypot(.8,.4),gold=radius-.4;
  arc(c,-.4,0,radius,circle,Math.atan2(.4,.8),Math.PI/2-Math.atan2(.4,.8));
  arc(c,-.4,.4,gold,circle,-Math.PI/2,Math.PI/2);
  line(c,-.4,.4,.4,.4,rule);line(c,.4,.4,.4,-.4,rule);line(c,.4,-.4,-.4,-.4,rule);
  line(c,-.4,-.4,-.4,radius,rule);line(c,-.4,0,.4,.4,rule);
  rubric();line(c,-.4,.4,-.4+gold,.4,red);line(c,-.4+gold,.32,-.4+gold,.48,red);
 }else if(kind==='i46'){
  arc(c,-.5,.5,1,circle,-Math.PI/2,Math.PI/2);
  line(c,-.5,.5,.5,.5,rule);line(c,-.5,.5,-.5,-.5,rule);
  rubric();line(c,-.5,-.5,.5,-.5,red);line(c,.5,-.5,.5,.5,red);
 }else{
  // Three outward squares on an exact 3:4:5 right triangle (Elements I.47).
  const u=.18,A=[-.45,.3],B=[A[0]+4*u,A[1]],C=[A[0],A[1]-3*u];
  arc(c,A[0],A[1],3*u,circle,-Math.PI/2,Math.PI/2);
  const poly=(pts:number[][],progress:number)=>pts.forEach((a,i)=>{const b=pts[(i+1)%pts.length];line(c,a[0],a[1],b[0],b[1],progress)});
  poly([A,B,[B[0],B[1]+4*u],[A[0],A[1]+4*u]],rule);
  poly([A,C,[C[0]-3*u,C[1]],[A[0]-3*u,A[1]]],rule);
  poly([B,C,[C[0]+3*u,C[1]-4*u],[B[0]+3*u,B[1]-4*u]],rule);
  rubric();poly([A,B,C],red);
 }
 c.restore();
}
export const figures:Record<Figure,Drawing>={
 i1:(...a)=>draw(...a,'i1'),i10:(...a)=>draw(...a,'i10'),iii1:(...a)=>draw(...a,'iii1'),
 i2:(...a)=>draw(...a,'i2'),i9:(...a)=>draw(...a,'i9'),ii11:(...a)=>draw(...a,'ii11'),
 i46:(...a)=>draw(...a,'i46'),i47:(...a)=>draw(...a,'i47')
};
export const captions:Record<Figure,string>={i1:'Elements I.1',i10:'Elements I.10',iii1:'Elements III.1',
 i2:'Elements I.2',i9:'Elements I.9',ii11:'Elements II.11',i46:'Elements I.46',i47:'Elements I.47'};
