import type {PadStrokes} from './ink';
import {TUTOR_IMAGE_LIMIT} from '../../../data/tutor/attachment-types';

const MAX_EDGE=1024;
const encode=(canvas:HTMLCanvasElement,mime:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>blob&&blob.size<=TUTOR_IMAGE_LIMIT?resolve(blob):reject(new Error('Image is too large.')),mime,quality);
});

export function fittedImageSize(width:number,height:number,max=MAX_EDGE) {
  if (!(width>0&&height>0)) throw new Error('The image has no pixels.');
  const scale=Math.min(1,max/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export function inkBounds(strokes:PadStrokes,margin=16) {
  const points=strokes.flat();
  if (!points.length) return null;
  const x=Math.min(...points.map(point=>point.x))-margin, y=Math.min(...points.map(point=>point.y))-margin;
  return {x,y,width:Math.max(...points.map(point=>point.x))+margin-x,height:Math.max(...points.map(point=>point.y))+margin-y};
}

export async function rasterizeInk(strokes:PadStrokes,width=3,accent=false) {
  const crop=inkBounds(strokes);
  if (!crop) throw new Error('Draw something first.');
  const canvas=document.createElement('canvas');
  const size=fittedImageSize(crop.width*2,crop.height*2);
  canvas.width=size.width;
  canvas.height=size.height;
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the drawing.');
  ctx.scale(size.width/crop.width,size.height/crop.height);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,crop.width,crop.height);
  ctx.translate(-crop.x,-crop.y);
  ctx.strokeStyle=accent?'#a8476d':'#141413';
  ctx.lineWidth=width;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  for (const stroke of strokes) {
    ctx.beginPath();
    ctx.moveTo(stroke[0].x,stroke[0].y);
    if (stroke.length===1) ctx.lineTo(stroke[0].x+0.01,stroke[0].y);
    else for (const point of stroke.slice(1)) ctx.lineTo(point.x,point.y);
    ctx.stroke();
  }
  return encode(canvas,'image/png');
}

/** Canvas re-encoding retains pixels and strips EXIF/GPS and the original filename. */
export async function reencodePhoto(file:Blob) {
  const photo=await createImageBitmap(file);
  try {
    const canvas=document.createElement('canvas');
    const {width,height}=fittedImageSize(photo.width,photo.height);
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the photo.');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,width,height);
    ctx.drawImage(photo,0,0,width,height);
    try {return await encode(canvas,'image/jpeg',.82);}
    catch {return await encode(canvas,'image/jpeg',.58);}
  } finally {
    photo.close();
  }
}
