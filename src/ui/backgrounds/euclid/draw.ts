/* Compass and straightedge drawings, pure in (context, size, palette, progress).
 * Every figure is deliberately faint; the accent stroke is its last phase. */
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
 c.save();const s=Math.min(w*.2,h*.17,130),x=w*.72,y=h*.32;
 c.translate(x,y);c.lineWidth=1.2;c.strokeStyle=t.ink;c.globalAlpha=.12;
 const circle=phase(p,0,.58),rule=phase(p,.5,.82),red=phase(p,.78,1);
 const A=-s*.5,B=s*.5;
 if(kind==='i1'){
  arc(c,A,0,s,circle);arc(c,B,0,s,circle);
  c.strokeStyle=t.ink;line(c,A,0,B,0,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.27;line(c,A,0,0,-Math.sqrt(3)*s/2,red);line(c,B,0,0,-Math.sqrt(3)*s/2,red);
 } else if(kind==='i10'){
  arc(c,A,0,s*.76,circle,-1.03,2.06);arc(c,B,0,s*.76,circle,Math.PI-1.03,2.06);
  line(c,A,0,B,0,rule);c.strokeStyle=t.accent;c.globalAlpha=.25;line(c,0,-s*.58,0,s*.58,red);
 } else if(kind==='iii1'){
  arc(c,0,0,s*.85,circle);line(c,-s*.67,-s*.52,s*.68,-s*.52,rule);
  line(c,0,-s*.72,0,s*.62,rule);c.strokeStyle=t.accent;c.globalAlpha=.26;arc(c,0,0,s*.08,red);
 } else if(kind==='i2'){
  arc(c,-s*.42,s*.2,s*.7,circle);arc(c,s*.38,s*.2,s*.42,circle);
  line(c,-s*.42,s*.2,s*.42,s*.2,rule);line(c,-s*.42,s*.2,0,-s*.55,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.27;line(c,s*.38,s*.2,s*.38,-s*.42,red);
 } else if(kind==='i9'){
  arc(c,0,s*.22,s*.62,circle,-Math.PI*.89,Math.PI*.55);
  line(c,0,s*.22,-s*.8,-s*.44,rule);line(c,0,s*.22,s*.8,-s*.44,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.27;line(c,0,s*.22,0,-s*.69,red);
 } else if(kind==='ii11'){
  arc(c,-s*.6,-s*.3,s*.58,circle,-.1,Math.PI*1.1);
  line(c,-s,0,s,0,rule);line(c,-s*.24,-s*.14,-s*.24,s*.14,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.3;line(c,-s*.24,0,s,0,red);
 } else if(kind==='i46'){
  arc(c,-s*.4,s*.48,s*.4,circle,-Math.PI*.7,Math.PI*1.3);
  line(c,-s*.5,s*.5,s*.5,s*.5,rule);line(c,-s*.5,s*.5,-s*.5,-s*.5,rule);line(c,-s*.5,-s*.5,s*.5,-s*.5,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.28;line(c,s*.5,-s*.5,s*.5,s*.5,red);
 } else if(kind==='i47'){
  arc(c,-s*.35,s*.3,s*.3,circle);
  line(c,-s*.47,-s*.2,s*.45,-s*.2,rule);line(c,-s*.47,-s*.2,-s*.47,s*.46,rule);
  c.strokeStyle=t.accent;c.globalAlpha=.25;line(c,-s*.47,s*.46,s*.45,-s*.2,red);
  // Squares on the two legs and hypotenuse of the right triangle.
  line(c,-s*.47,-s*.2,-s*.47,-s*.65,red);line(c,-s*.47,-s*.65,s*.45,-s*.65,red);
  line(c,s*.45,-s*.65,s*.45,-s*.2,red);
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
