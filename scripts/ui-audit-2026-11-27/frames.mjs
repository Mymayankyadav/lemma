// Decode in Chromium at low resolution for measurement. Only selected evidence uses CSS-pixel frames.
export function summariseFrames({frames,anchor,strip}) {
  return (async()=>{
    const samples=[],tiles=[];
    let last;
    for(const frame of frames) {
      const data=Uint8Array.from(atob(frame.data),c=>c.charCodeAt(0));
      const image=await createImageBitmap(new Blob([data],{type:'image/jpeg'}));
      const canvas=document.createElement('canvas');
      canvas.width=96;canvas.height=Math.max(1,Math.round(96*image.height/image.width));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const values=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let change=0;
      if(last)for(let i=0;i<values.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(values[i+k]-last[i+k])))>10)change++;
      last=values;samples.push({ms:Math.round(frame.t-anchor),changed:change/(values.length/4)});
      if(strip)tiles.push(image);else image.close();
    }
    const changed=samples.filter(s=>s.ms>=0&&s.changed>0.001);
    const result={frames:samples.length,firstChangeMs:changed[0]?.ms??null,lastChangeMs:changed.at(-1)?.ms??null,samples};
    if(!tiles.length)return result;
    const before=Math.max(0,samples.findLastIndex(s=>s.ms<0)),end=tiles.length-1;
    const middle=changed.length?changed[Math.floor((changed.length-1)/2)]:samples[Math.floor((before+end)/2)];
    const indices=[...new Set([before,samples.indexOf(middle),end])].sort((a,b)=>a-b);
    const {width:w,height:h}=tiles[0],vertical=w>h;
    const canvas=document.createElement('canvas'),label=28;
    canvas.width=w*(vertical?1:indices.length);canvas.height=(h+label)*(vertical?indices.length:1);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#1e1e1e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.font='16px sans-serif';
    for(const [j,i] of indices.entries()){
      const x=vertical?0:j*w,y=vertical?j*(h+label):0;
      ctx.fillText(samples[i].ms<0?'Before':('+'+samples[i].ms+' ms'),x+8,y+19);ctx.drawImage(tiles[i],x,y+label);
    }
    for(const tile of tiles)tile.close();
    return {...result,image:canvas.toDataURL('image/png').split(',')[1]};
  })();
}
