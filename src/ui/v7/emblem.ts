export type EmblemKind = "partial-sums" | "mapped-plane" | "torus-knot" | "multiplication-circle" | "euclid" | "hasse" | "galton" | "pascal" | "rose";
export type EmblemStroke = {d:string;opacity:number;width:number};
const cache=new Map<string,readonly EmblemStroke[]>();
export function emblemHash(s:string):number {let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function emblemKind(subject:string):EmblemKind{
 const s=subject.toLowerCase();
 if(/analysis|calculus|measure/.test(s))return "partial-sums";
 if(/number|prime|integer/.test(s))return "multiplication-circle";
 if(/topology|manifold|knot/.test(s))return "torus-knot";
 if(/geometry|euclid/.test(s))return "euclid";
 if(/logic|boolean/.test(s))return "hasse";
 if(/probability|statistics/.test(s))return "galton";
 if(/combinatoric|counting/.test(s))return "pascal";
 if(/algebra|linear|matrix|group|ring/.test(s))return "mapped-plane";
 return "rose";
}
function path(points:readonly [number,number][]):string{return points.map(([x,y],i)=>(i?"L":"M")+x.toFixed(2)+" "+y.toFixed(2)).join("");}
function circle(x:number,y:number,r:number):string{return "M"+(x+r).toFixed(2)+" "+y.toFixed(2)+"a"+r+" "+r+" 0 1 0 "+(-2*r)+" 0a"+r+" "+r+" 0 1 0 "+(2*r)+" 0";}
function seeded(h:number){let x=h||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
/** Mathematical, deterministic constructions with bounded stroke count and stable seed. */
export function emblemStrokes(subject:string,seed:string,kind:EmblemKind=emblemKind(subject)):readonly EmblemStroke[]{
 const key=JSON.stringify([subject,seed,kind]),existing=cache.get(key);if(existing)return existing;
 const h=emblemHash(seed),random=seeded(h),strokes:EmblemStroke[]=[];
 const add=(d:string,opacity=.8,width=1)=>strokes.push({d,opacity,width});
 if(kind==="partial-sums"){
  for(const [i,n] of [1,3,5,7,9,11,13].entries()){
   const pts:[number,number][]=[];
   for(let j=0;j<=160;j++){const x=-2*Math.PI+j*4*Math.PI/160;let y=0;for(let k=1;k<=n;k+=2)y+=Math.sin(k*x)/k;
    pts.push([j*1.25,100-45*4/Math.PI*y]);}
   add(path(pts),.28+i*.12,i===6?1.4:.65);
  }
 }else if(kind==="mapped-plane"){
  const theta=(h%9-4)*.015,rot=(x:number,y:number):[number,number]=>[x*Math.cos(theta)-y*Math.sin(theta),x*Math.sin(theta)+y*Math.cos(theta)];
  for(let i=-4;i<=4;i++)for(const vertical of [true,false]){
   const a=vertical?[i*17,-68]:[-68,i*17],b=vertical?[i*17,68]:[68,i*17];
   add(path([[100+a[0],100+a[1]],[100+b[0],100+b[1]]]),.25,.55);
   const va=rot(1.15*a[0]+.55*a[1],.25*a[0]+.9*a[1]),vb=rot(1.15*b[0]+.55*b[1],.25*b[0]+.9*b[1]);
   add(path([[100+va[0],100+va[1]],[100+vb[0],100+vb[1]]]),.75,.7);
  }
  const a=1.15*Math.cos(theta)-.25*Math.sin(theta), b=.55*Math.cos(theta)-.9*Math.sin(theta);
  const c=1.15*Math.sin(theta)+.25*Math.cos(theta), d=.55*Math.sin(theta)+.9*Math.cos(theta);
  const disc=Math.sqrt((a-d)**2+4*b*c);
  for(const eigen of [(a+d+disc)/2,(a+d-disc)/2]){
   const angle=Math.atan2(eigen-a,b);add(path([[100-100*Math.cos(angle),100-100*Math.sin(angle)],[100+100*Math.cos(angle),100+100*Math.sin(angle)]]),1,1.8);
  }
 }else if(kind==="torus-knot"){
  const pairs:[[number,number],[number,number],[number,number]]=[[2,3],[2,5],[3,4]], [p,q]=pairs[h%pairs.length];
  // Project a torus knot from 3D with a stable oblique view, as 12 ribbon offsets.
  for(let offset=0;offset<12;offset++){
   const points:[number,number][]=[];
   for(let j=0;j<=300;j++){const t=j*2*Math.PI/300,r=53+(22+offset*.38)*Math.cos(q*t);
    const x=r*Math.cos(p*t),y=r*Math.sin(p*t),z=(22+offset*.38)*Math.sin(q*t);
    points.push([100+x,100+.68*y+.6*z]);}
   add(path(points),.3+offset*.045,.55);
  }
 }else if(kind==="multiplication-circle"){
  const k=[2,3,4,5][h%4],n=150;
  add(circle(100,100,89),.9,.8);
  for(let i=0;i<n;i++){const a=2*Math.PI*i/n,b=2*Math.PI*((k*i)%n)/n;
   add(path([[100+89*Math.cos(a),100+89*Math.sin(a)],[100+89*Math.cos(b),100+89*Math.sin(b)]]),.38,.48);}
 }else if(kind==="euclid"){
  const r=65,cx=100,cy=110,dy=110-65*Math.sqrt(3)/2;
  add(circle(cx-r/2,cy,r),.6,.8);add(circle(cx+r/2,cy,r),.6,.8);
  const tri:[[number,number],[number,number],[number,number]]=[[cx-r/2,cy],[cx+r/2,cy],[cx,dy]];
  add(path([...tri,tri[0]]),1,1.7);
  for(let i=0;i<9;i++){const n=3+i%4,phase=i*.14,pts:[number,number][]=[];
   for(let j=0;j<=n;j++){const a=(j%n)*2*Math.PI/n+phase;pts.push([100+(18+i*5)*Math.cos(a),100+(18+i*5)*Math.sin(a)]);}
   add(path(pts),.35+i*.05,.65);}
 }else if(kind==="hasse"){
  const points:[number,number][]=[[100,172],[45,125],[100,125],[155,125],[45,75],[100,75],[155,75],[100,28]];
  const edges=[[0,1],[0,2],[0,3],[1,4],[1,5],[2,4],[2,6],[3,5],[3,6],[4,7],[5,7],[6,7]];
  for(const [a,b] of edges)add(path([points[a],points[b]]),.8,1.2);
  for(const [x,y] of points)add(circle(x,y,5),1,1.5);
 }else if(kind==="galton"){
  const count=60+h%141;
  for(let i=0;i<count;i++){const pts:[number,number][]=[[100,20]];
   let x=100;for(let k=0;k<9;k++){x+=(random()>.5?1:-1)*8;pts.push([x,20+k*16+16]);}
   add(path(pts),.14,.7);}
  add(path([[32,176],[168,176]]),.8,1);
 }else if(kind==="pascal"){
  const rows=9;
  for(let n=0;n<rows;n++)for(let k=0;k<=n;k++){
   if((k&n)===k){const x=100+(k-n/2)*20,y=26+n*18;add(circle(x,y,3.5),.95,1.2);}
  }
 }else{
  const k=[5,7,8,9][h%4],pts:[number,number][]=[];
  for(let i=0;i<=400;i++){const a=i*2*Math.PI/400,r=88*Math.cos(k*a);
   pts.push([100+r*Math.cos(a),100+r*Math.sin(a)]);}
  add(path(pts),.9,1);
 }
 if(strokes.length>400)strokes.length=400;
 if(cache.size>=256)cache.delete(cache.keys().next().value!);
 cache.set(key,strokes);
 return strokes;
}

