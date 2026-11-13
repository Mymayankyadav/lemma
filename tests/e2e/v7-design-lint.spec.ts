import {test,expect} from "@playwright/test";
import {openScene,shots} from "./v7-scenes";
// PA11 (Night critique v2): the rendered half of the v7 design lint. It opens every v7 scene in Day and Night at 390 and
// 320 px and fails on what the static check in scripts/v7/check-kit.mjs cannot see:
//  - a button that is not 48 px (44 px small, 40 px for a fine pointer from 700 px);
//  - a visible native select, date or time control;
//  - a status Badge without its icon;
//  - a subject colour used as a bare dot (no glyph within 8 px);
//  - indigo (action.bg) on a meter, bar or chart;
//  - text cut to fewer than four characters by an ellipsis;
//  - a horizontal page scroll;
//  - an emblem over its tier's stroke budget (R2) or a textarea with a resize grip (R1).
test.use({deviceScaleFactor:1,locale:"en-IN",timezoneId:"Asia/Kolkata"});
// N157 (V11, definition of done): also 360 px at 130% and 200% text, and a 1280 px desktop.
const sizes:{width:number;height:number;text?:number}[]=[{width:390,height:844},{width:320,height:640},{width:360,height:740,text:130},{width:360,height:740,text:200},{width:1280,height:800}];

for(const scheme of ["light","dark"] as const){
 for(const shot of shots){
  for(const size of sizes){
   test(`lint ${shot.name} ${scheme==="light"?"day":"night"} ${size.width}${size.text?" at "+size.text+"%":""}`,async({page})=>{
    await openScene(page,shot,scheme,size);
    const problems=await page.evaluate(text=>{
     const out:string[]=[];
     const root=getComputedStyle(document.documentElement),token=(name:string)=>{
      const probe=document.createElement("i");probe.style.color=`var(${name})`;document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;
     };
     const subjectColours=["analysis","algebra","topology","number-theory","geometry","logic","probability","combinatorics"].map(name=>token("--v7-role-subject-"+name));
     const indigo=token("--v7-role-action-bg");
     void root;
     const visible=(node:Element)=>{
      const box=node.getBoundingClientRect(),style=getComputedStyle(node);
      return box.width>0&&box.height>0&&style.visibility!=="hidden"&&style.display!=="none"&&!node.closest("[inert],[aria-hidden='true'] .v7-sr-only");
     };
     const where=(node:Element)=>node.tagName.toLowerCase()+(node.className&&typeof node.className==="string"?"."+node.className.trim().split(/\s+/).slice(0,2).join("."):"")+" “"+(node.textContent??"").trim().slice(0,24)+"”";
     const inClosedDialog=(node:Element)=>{const dialog=node.closest("dialog");return !!dialog&&!dialog.open;};
     // Buttons: 48, 44 small; 40 only for a fine pointer from 700 px (N157 · V23: the pointer decides, not the width).
     const allowed=innerWidth>=700&&matchMedia("(pointer:fine)").matches?[40,44]:[44,48];
     for(const node of document.querySelectorAll(".v7-button")){
      if(!visible(node)||inClosedDialog(node))continue;
      const height=Math.round(node.getBoundingClientRect().height);
      // N157: with raised text a button may grow with its words (never shrink below its size); at 100% it is exact.
      if(text>100?height<Math.min(...allowed):!allowed.includes(height))out.push("button height "+height+": "+where(node));
     }
     // Native controls.
     for(const node of document.querySelectorAll("select,input[type=date],input[type=time],input[type=datetime-local]")){
      if(visible(node)&&!inClosedDialog(node))out.push("native control: "+where(node));
     }
     // Status badges carry their icon.
     for(const node of document.querySelectorAll(".v7-badge")){
      if(!visible(node)||inClosedDialog(node))continue;
      if(!node.querySelector("svg,.v7-proof-symbol"))out.push("badge without icon: "+where(node));
     }
     // A subject colour as a bare dot: a small element filled with a subject colour and no glyph inside.
     for(const node of document.querySelectorAll("body *")){
      if(!visible(node)||inClosedDialog(node)||node.closest("svg,canvas"))continue;
      const box=node.getBoundingClientRect();
      if(box.width>12||box.height>12||box.width<3)continue;
      const fill=getComputedStyle(node).backgroundColor;
      if(subjectColours.includes(fill)&&!node.querySelector("svg"))out.push("bare subject dot: "+where(node));
     }
     // Indigo on a meter, bar or chart.
     for(const node of document.querySelectorAll("[role=meter] *,.v7-meter *,.v7-chart *,.v7-today-target-track *,.v7-rv-split-bar *")){
      if(!visible(node)||inClosedDialog(node))continue;
      const style=getComputedStyle(node);
      if(style.backgroundColor===indigo||(node instanceof SVGElement&&(style.fill===indigo||style.stroke===indigo)))out.push("indigo on a meter or chart: "+where(node));
     }
     // Text cut to fewer than four characters.
     for(const node of document.querySelectorAll("body *")){
      if(!visible(node)||inClosedDialog(node)||node.children.length>0)continue;
      const style=getComputedStyle(node);
      if(style.textOverflow!=="ellipsis"&&style.webkitLineClamp==="none")continue;
      if(node.scrollWidth<=node.clientWidth+1)continue;
      const chars=Math.floor(node.clientWidth/(parseFloat(style.fontSize)*.55));
      if(chars<4)out.push("text cut to "+chars+" characters: "+where(node));
     }
     // Release plan R2 (emblem v2, audit F27): no tile with more than 24 strokes, no hero with more than 160, glyphs 1–3.
     for(const node of document.querySelectorAll("svg.v7-emblem[data-tier]")){
      const tier=node.getAttribute("data-tier"),strokes=Number(node.getAttribute("data-strokes"));
      const limit=tier==="tile"?24:tier==="glyph"?3:160;
      if(strokes>limit)out.push("emblem "+tier+" with "+strokes+" strokes");
     }
     // Release plan R1 (F35): no textarea resize grips.
     for(const node of document.querySelectorAll("textarea")){
      if(visible(node)&&!inClosedDialog(node)&&getComputedStyle(node).resize!=="none")out.push("textarea with a resize grip: "+where(node));
     }
     if(document.documentElement.scrollWidth>innerWidth+1)out.push("horizontal page scroll: "+document.documentElement.scrollWidth+" > "+innerWidth);
     return out;
    },size.text??100);
    expect(problems,shot.name).toEqual([]);
   });
  }
 }
}
