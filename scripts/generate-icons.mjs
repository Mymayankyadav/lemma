/**
 * Generate Android-installable 192/512 PNG icons from the same mathematical
 * constellation artwork on every build. No native canvas, font or image dependencies.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';

const out=join(process.cwd(),'public','icons');
mkdirSync(out,{recursive:true});
const palette={
 background:[13,12,17],card:[23,21,29],border:[56,48,57],
 edge:[113,85,46],halo:[72,53,30],amber:[247,181,56],light:[255,224,161],
};
const clamp=(x)=>Math.max(0,Math.min(1,x));
const blend=(base,fg,a)=>base.map((b,i)=>Math.round(b*(1-clamp(a))+fg[i]*clamp(a)));
const distanceLine=(x,y,ax,ay,bx,by)=>{
 const dx=bx-ax,dy=by-ay;
 const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
};
function pixel(x,y,maskable){
 const p=[x,y],a=[.31,.42],b=[.70,.30],c=[.61,.70];
 let color=palette.background;
 const qx=Math.abs(x-.5)-.24,qy=Math.abs(y-.5)-.24;
 const sdf=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-.20;
 if(maskable)color=palette.card;
 else{
  color=blend(color,palette.border,clamp((.01-sdf)*480));
  color=blend(color,palette.card,clamp((-.004-sdf)*480));
 }
 for(const [u,v] of [[a,b],[b,c],[c,a]]){
  const d=distanceLine(...p,...u,...v);
  color=blend(color,palette.edge,clamp((.009-d)*280));
 }
 for(const [i,[nx,ny]] of [a,b,c].entries()){
  const d=Math.hypot(x-nx,y-ny),radius=i===2?.066:.054;
  color=blend(color,palette.halo,clamp((radius*1.9-d)*180));
  color=blend(color,i===2?palette.light:palette.amber,clamp((radius-d)*260));
 }
 const square=Math.max(Math.abs(x-.58),Math.abs(y-.63));
 color=blend(color,palette.amber,clamp((.043-square)*280));
 return color;
}
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
function generate(size,maskable=false){
 const bytes=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++){
  const row=y*(size*4+1);bytes[row]=0;
  for(let x=0;x<size;x++){
   const rgb=pixel((x+.5)/size,(y+.5)/size,maskable),offset=row+1+x*4;
   bytes[offset]=rgb[0];bytes[offset+1]=rgb[1];bytes[offset+2]=rgb[2];bytes[offset+3]=255;
  }
 }
 const header=Buffer.alloc(13);
 header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);
 header[8]=8;header[9]=6;
 const png=Buffer.concat([
  Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(bytes,{level:9})),chunk('IEND',Buffer.alloc(0)),
 ]);
 const name=maskable?'lemma-maskable-512.png':'lemma-'+size+'.png';
 writeFileSync(join(out,name),png);
 console.log('Generated '+name+' ('+png.length+' bytes)');
}
generate(192);generate(512);generate(512,true);


function generateBadge(){
 const size=96,bytes=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++){
  const row=y*(size*4+1);bytes[row]=0;
  for(let x=0;x<size;x++){
   const px=(x+.5)/size,py=(y+.5)/size;
   // White-on-transparent partial-derivative glyph (∂), never a colour cue.
   const outer=Math.hypot((px-.49)/.27,(py-.61)/.27);
   const inner=Math.hypot((px-.49)/.17,(py-.61)/.17);
   const loop=outer<=1&&inner>=1;
   const stem=distanceLine(px,py,.64,.44,.43,.15)<.045;
   const join=distanceLine(px,py,.62,.44,.57,.33)<.045;
   const alpha=loop||stem||join?255:0;
   const offset=row+1+x*4;
   bytes[offset]=255;bytes[offset+1]=255;bytes[offset+2]=255;bytes[offset+3]=alpha;
  }
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);
 header[8]=8;header[9]=6;
 const png=Buffer.concat([
  Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),
  chunk('IDAT',deflateSync(bytes,{level:9})),chunk('IEND',Buffer.alloc(0)),
 ]);
 writeFileSync(join(out,'badge-96.png'),png);
 console.log('Generated badge-96.png ('+png.length+' bytes)');
}
generateBadge();
