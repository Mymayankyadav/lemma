export type EmblemKind = 'partial-sums' | 'mapped-plane' | 'torus-knot' | 'multiplication-circle' | 'rose';
export type EmblemStroke = { d: string; opacity: number; width: number };
const cache = new Map<string, readonly EmblemStroke[]>();
export function emblemKind(subject: string): EmblemKind {
 const s = subject.toLowerCase();
 if (/analysis|calculus|measure/.test(s)) return 'partial-sums';
 if (/linear|matrix/.test(s)) return 'mapped-plane';
 if (/topology|geometry|manifold/.test(s)) return 'torus-knot';
 if (/algebra|group|ring|number/.test(s)) return 'multiplication-circle';
 return 'rose';
}
export function emblemHash(s:string):number { let n=2166136261; for(const c of s) n=Math.imul(n^c.charCodeAt(0),16777619); return n>>>0; }
function path(points:readonly [number,number][]):string { return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(''); }
/** Deterministic 200-unit paths; cached by subject, stable identity, and chosen kind. */
export function emblemStrokes(subject:string,seed:string,kind:EmblemKind=emblemKind(subject)):readonly EmblemStroke[] {
 const key=JSON.stringify([subject,seed,kind]); const saved=cache.get(key); if(saved)return saved;
 const h=emblemHash(seed), strokes:EmblemStroke[]=[];
 if(kind==='partial-sums') for(const [i,n] of [1,3,5,9,17,33].entries()){
  const points:[number,number][]=[];
  for(let j=0;j<=160;j++){const x=-2*Math.PI+j*4*Math.PI/160;let y=0;for(let k=1;k<=n;k+=2)y+=Math.sin(k*x)/k;points.push([j*1.25,100-45*4/Math.PI*y]);}
  strokes.push({d:path(points),opacity:.28+i*.14,width:i===5?1.4:.65});
 } else if(kind==='mapped-plane'){
  for(let i=-4;i<=4;i++)for(const vertical of [true,false]){
   const a=vertical?[i*17,-68]:[-68,i*17],b=vertical?[i*17,68]:[68,i*17];
   strokes.push({d:path([[100+a[0],100+a[1]],[100+b[0],100+b[1]]]),opacity:.22,width:.55});
   strokes.push({d:path([[100+1.15*a[0]+.55*a[1],100+.25*a[0]+.9*a[1]],[100+1.15*b[0]+.55*b[1],100+.25*b[0]+.9*b[1]]]),opacity:.75,width:.65});
  }
  const disc=Math.sqrt((1.15-.9)**2+4*.55*.25);
  for(const eigen of [(1.15+.9+disc)/2,(1.15+.9-disc)/2]){const angle=Math.atan2(eigen-1.15,.55);strokes.push({d:path([[100-100*Math.cos(angle),100-100*Math.sin(angle)],[100+100*Math.cos(angle),100+100*Math.sin(angle)]]),opacity:.9,width:1.6});}
 } else if(kind==='torus-knot'){
  const pairs=[[2,3],[3,4],[2,5],[3,5]], [p,q]=pairs[h%pairs.length];
  for(let r=20;r<=33;r+=3.25){const pts:[number,number][]=[];for(let j=0;j<=400;j++){const t=j*2*Math.PI/400;pts.push([100+(58+r*Math.cos(q*t))*Math.cos(p*t),100+(58+r*Math.cos(q*t))*Math.sin(p*t)]);}strokes.push({d:path(pts),opacity:.7,width:.65});}
 } else if(kind==='multiplication-circle'){
  const m=[2,3,4,5,7][h%5];for(let i=0;i<150;i++){const a=2*Math.PI*i/150,b=2*Math.PI*((m*i)%150)/150;strokes.push({d:path([[100+90*Math.cos(a),100+90*Math.sin(a)],[100+90*Math.cos(b),100+90*Math.sin(b)]]),opacity:.45,width:.45});}
 } else {const [p,q]=[[5,3],[7,4],[8,5],[7,2]][h%4],pts:[number,number][]=[];for(let i=0;i<=500;i++){const t=i*2*Math.PI*q/500,r=90*Math.cos(p*t/q);pts.push([100+r*Math.cos(t),100+r*Math.sin(t)]);}strokes.push({d:path(pts),opacity:.85,width:1});}
 if(cache.size>=256) cache.delete(cache.keys().next().value!);
 cache.set(key,strokes);return strokes;
}
