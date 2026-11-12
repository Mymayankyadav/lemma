import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it} from "vitest";
import {Tag,Badge,FilterChip,ToggleButton,TimeRangeField,MasteryBar,ConstellationProgress,StatementCard,SubjectMark,RangeSlider} from "../../../src/ui/v7/KitPrimitives";
function host(){const mount=document.createElement("div");document.body.append(mount);const root=createRoot(mount);return {mount,root,dispose:async()=>{await act(async()=>root.unmount());mount.remove();}};}
describe("Constellation UI kit",()=>{
 it("keeps status, subject and filter semantics independent",async()=>{
  const h=host();
  try{await act(async()=>h.root.render(<><Tag subject="Analysis"/><Badge tone="warning">Warning · Review due</Badge><FilterChip selected onChange={()=>{}}>Due today</FilterChip><ToggleButton selected onChange={()=>{}}>Pinned</ToggleButton></>));
   expect(h.mount.querySelector(".v7-tag .v7-subject-mark")).not.toBeNull();
   expect(h.mount.querySelector(".v7-badge svg")).not.toBeNull();
   expect(h.mount.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  }finally{await h.dispose();}
 });
 it("joins time-range presets into one accessible control",async()=>{
  const h=host();
  try{await act(async()=>h.root.render(<TimeRangeField/>));
   expect(h.mount.querySelectorAll('.v7-time-input input')).toHaveLength(2);
   const chips=h.mount.querySelectorAll('.v7-preset-wrap button');
   expect(chips[1].getAttribute("aria-pressed")).toBe("true");
   await act(async()=>chips[0].click());
   expect(chips[0].getAttribute("aria-pressed")).toBe("true");
   expect(h.mount.textContent).toContain("25");
  }finally{await h.dispose();}
 });
 it("shows an accessible checkpoint list and demonstrated proof",async()=>{
  const h=host();
  try{await act(async()=>h.root.render(<><MasteryBar subject="Topology" value={100}/><ConstellationProgress/><StatementCard kind="Theorem" demonstrated/><SubjectMark subject="Probability" size="hero"/></>));
   expect(h.mount.querySelector('ol[aria-label="Analysis checkpoints"]')?.querySelectorAll('li')).toHaveLength(7);
   expect(h.mount.querySelector('div[role="progressbar"]')?.getAttribute("aria-valuetext")).toBe("Demonstrated");
   expect(h.mount.querySelector(".v7-qed")?.textContent).toBe("∎");
   expect(h.mount.querySelector(".v7-emblem")?.getAttribute("aria-hidden")).toBe("true");
  }finally{await h.dispose();}
 });
 it("exposes units and Page Up/Down keyboard access on the slider",async()=>{
  const h=host();
  try{let change:number|undefined; await act(async()=>h.root.render(<RangeSlider label="Duration" value={45} min={5} max={90} unit="min" onChange={n=>change=n}/>));
   const range=h.mount.querySelector<HTMLInputElement>('input[type="range"]')!;
   expect(range.getAttribute("aria-valuetext")).toBe("45 min");
   await act(async()=>range.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"PageUp"})));
   expect(change).toBe(60);
  }finally{await h.dispose();}
 });
});

