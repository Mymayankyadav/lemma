/**
 * Generate the installed-app icons, favicons and launcher shortcut icons from the Notebook mark
 * (scripts/brand/lemma-mark.mjs) on every build. No native canvas, font or image dependencies.
 * Output goes to public/icons/ (git-ignored).
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {markSvg,rasterMark,MARK_THEMES} from './brand/lemma-mark.mjs';

const out=join(process.cwd(),'public','icons');
mkdirSync(out,{recursive:true});

function crc32(buffer){
 let crc=-1;
 for(const byte of buffer){
  crc^=byte;
  for(let i=0;i<8;i++)crc=(crc>>>1)^(-(crc&1)&0xEDB88320);
 }
 return (crc^(-1))>>>0;
}
function chunk(name,data){
 const label=Buffer.from(name,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
 length.writeUInt32BE(data.length,0);
 crc.writeUInt32BE(crc32(Buffer.concat([label,data])),0);
 return Buffer.concat([length,label,data,crc]);
}
/** Encode RGBA pixels as PNG; `opaque` writes RGB only (Apple touch icons must have no transparency). */
export function encodePng(size,rgba,opaque=false){
 const channels=opaque?3:4,bytes=Buffer.alloc(size*(size*channels+1));
 for(let y=0;y<size;y++){
  const row=y*(size*channels+1);bytes[row]=0;
  for(let x=0;x<size;x++){
   const src=(y*size+x)*4,dst=row+1+x*channels;
   for(let k=0;k<channels;k++)bytes[dst+k]=rgba[src+k];
  }
 }
 const header=Buffer.alloc(13);
 header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);
 header[8]=8;header[9]=opaque?2:6;
 return Buffer.concat([
  Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(bytes,{level:9})),chunk('IEND',Buffer.alloc(0)),
 ]);
}
const write=(name,data)=>{writeFileSync(join(out,name),data);console.log('Generated '+name+' ('+data.length+' bytes)');};

// Installed icons: the graph-paper Day page (D3 = C · Notebook); full bleed, the platform applies its own mask.
const icon=(size,opts={})=>encodePng(size,rasterMark({size,theme:'day',layout:size<64?'simple':'full',...opts}),opts.opaque);
write('lemma-192.png',icon(192));
write('lemma-512.png',icon(512));
write('lemma-maskable-512.png',icon(512)); // the ℓ and ∎ sit inside the central 80% circle; the grid is texture
write('apple-touch-icon.png',icon(180,{opaque:true}));

// Favicons: ℓ on a small graph-paper page that follows the device theme (no margin rule or ∎ at tab size).
write('favicon.svg',Buffer.from(markSvg({theme:'auto',layout:'simple',background:'rounded',size:32})));
const fav32=encodePng(32,rasterMark({size:32,theme:'day',layout:'simple',background:'rounded'}));
const fav16=encodePng(16,rasterMark({size:16,theme:'day',layout:'simple',background:'rounded'}));
write('favicon-32.png',fav32);
{ // ICO container with embedded PNGs (16 and 32)
 const images=[[16,fav16],[32,fav32]],head=Buffer.alloc(6+16*images.length);
 head.writeUInt16LE(0,0);head.writeUInt16LE(1,2);head.writeUInt16LE(images.length,4);
 let offset=head.length;
 images.forEach(([size,png],k)=>{
  const e=6+16*k;head[e]=size;head[e+1]=size;head[e+2]=0;head[e+3]=0;
  head.writeUInt16LE(1,e+4);head.writeUInt16LE(32,e+6);head.writeUInt32LE(png.length,e+8);head.writeUInt32LE(offset,e+12);
  offset+=png.length;
 });
 write('favicon.ico',Buffer.concat([head,...images.map(([,png])=>png)]));
}
// Vector masters for reference (Day and Night, 1024).
write('lemma-mark-night.svg',Buffer.from(markSvg({theme:'night'})));
write('lemma-mark-day.svg',Buffer.from(markSvg({theme:'day'})));

/** 96 px launcher shortcuts in the same family: a notebook page (rounded square with a margin rule) holding a cards glyph,
 * a check or a star, on transparency. */
const clamp=(x)=>Math.max(0,Math.min(1,x));
const seg=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy));return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
const polyline=(x,y,pts,closed)=>{let d=1;for(let k=0;k<pts.length-(closed?0:1);k++){const a=pts[k],b=pts[(k+1)%pts.length];d=Math.min(d,seg(x,y,a[0],a[1],b[0],b[1]));}return d;};
const roundRect=(x,y,cx,cy,hw,hh,r)=>{const qx=Math.abs(x-cx)-hw+r,qy=Math.abs(y-cy)-hh+r;return Math.abs(Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r);};
const star=Array.from({length:10},(_,k)=>{const a=-Math.PI/2+k*Math.PI/5,r=k%2?0.095:0.215;return [0.5+r*Math.cos(a),0.515+r*Math.sin(a)];});
const glyphs={
 review:(x,y)=>Math.min(roundRect(x,y,0.47,0.53,0.13,0.17,0.03),Math.max(roundRect(x,y,0.53,0.47,0.13,0.17,0.03),-(Math.max(Math.abs(x-0.47)-0.13,Math.abs(y-0.53)-0.17)))),
 approve:(x,y)=>polyline(x,y,[[0.35,0.51],[0.46,0.62],[0.66,0.40]],false),
 atlas:(x,y)=>polyline(x,y,star,true),
};
function shortcut(kind){
 const size=96,px=1/size,brand=MARK_THEMES.day.brand,ink=MARK_THEMES.day.ink;
 const rgb=(h)=>[1,3,5].map((k)=>parseInt(h.slice(k,k+2),16));
 const rgba=new Uint8ClampedArray(size*size*4);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const x=(i+.5)*px,y=(j+.5)*px;
  const page=clamp((0.03-roundRect(x,y,0.5,0.5,0.38,0.38,0.09))/px+.5),rule=Math.abs(x-0.27)<0.012&&Math.abs(y-0.5)<0.36?0.6:0,mark=clamp((0.032-glyphs[kind](x+0.03,y))/px+.5);
  const ring=Math.max(page,rule),colour=mark>=ring?rgb(ink):page>=rule?rgb(brand):rgb(MARK_THEMES.day.margin),a=Math.max(ring,mark),o=(j*size+i)*4;
  rgba[o]=colour[0];rgba[o+1]=colour[1];rgba[o+2]=colour[2];rgba[o+3]=Math.round(a*255);
 }
 write('shortcut-'+kind+'.png',encodePng(size,rgba));
}
for(const kind of ['review','approve','atlas'])shortcut(kind);
