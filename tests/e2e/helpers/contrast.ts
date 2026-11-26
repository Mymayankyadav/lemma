import type {Locator} from '@playwright/test';

/** Compare computed colors composited through flat ancestor backgrounds. */
export async function contrastAt(control:Locator) {
 return control.evaluate(element=>{
  // Computed CSS colors can serialize as RGB, OKLCH or color(srgb).
  const context=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('Cannot resolve computed colors without a canvas context');
  const rgba=(value:string)=>{
   context.clearRect(0,0,1,1);
   context.fillStyle=value;
   context.fillRect(0,0,1,1);
   const [r,g,b,a]=context.getImageData(0,0,1,1).data;
   return [r,g,b,a/255];
  };
  const blend=(foreground:number[],background:number[])=>background.map((value,index)=>index===3
   ? 1
   : foreground[index]*foreground[3]+value*(1-foreground[3]));
  const luminance=(rgb:number[])=>rgb.slice(0,3).map(value=>{
   const channel=value/255;
   return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
  }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast=(a:number[],b:number[])=>{
   const first=luminance(a)+.05,second=luminance(b)+.05;
   return Math.max(first,second)/Math.min(first,second);
  };
  const ancestors:CSSStyleDeclaration[]=[];
  for(let current=element.parentElement;current;current=current.parentElement)ancestors.push(getComputedStyle(current));
  const parent=ancestors.reverse().reduce((background,style)=>blend(rgba(style.backgroundColor),background),[255,255,255,1]);
  const style=getComputedStyle(element);
  const inside=blend(rgba(style.backgroundColor),parent);
  const foreground=blend(rgba(style.color),inside);
  const edge=blend(rgba(style.borderTopColor),inside);
  return {
   text:contrast(foreground,inside),
   edge:contrast(edge,parent),
   fill:contrast(inside,parent),
   border:parseFloat(style.borderTopWidth),
  };
 });
}
