// The capture and archive use this same list. Each example is a CSS-pixel viewport, keyboard or motion strip.
import {readFileSync} from 'node:fs';
import {profile} from './lib.mjs';
const entries=JSON.parse(readFileSync(new URL('./evidence.json',import.meta.url),'utf8'));
const examples=new Set(entries.map(([device,kind,id])=>[device,kind,id].join('/')));
export const imageMode=process.env.METRICS_ONLY==='1'?'none':(process.env.AUDIT_IMAGES??'compact');
if(!['compact','none','all'].includes(imageMode))throw new Error('AUDIT_IMAGES must be compact, none or all');
export function wantsImage(device,kind,id){
  return imageMode==='all'||(imageMode==='compact'&&profile==='standard'&&examples.has([device,kind,id].join('/')));
}
