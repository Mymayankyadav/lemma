import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {PlanMap} from "../../../src/features/plan-proposal/Page";
import type {ReviewNode} from "../../../src/features/plan-proposal/nodes";

describe("FIX #712 large plan-map accent budget",()=>{
 it("renders Expand all and unselected stage counts as graphite secondary marks",()=>{
  const nodes:ReviewNode[]=Array.from({length:17},(_,i)=>({
   code:`CP${i+1}`,title:`Checkpoint ${i+1}`,criterion:"",
   steps:[],prereqs:i?[`CP${i}`]:[],stage:`Stage ${Math.floor(i/5)+1}`,
  }));
  const html=renderToStaticMarkup(<PlanMap nodes={nodes} selected="" onSelect={()=>{}}/>);
  const button=html.match(/<button[^>]*>Expand all<\/button>/)?.[0];
  expect(button,"Large-plan stage overview must retain its secondary Expand all action").toBeTruthy();
  expect(button).toContain("text-ink-2");
  expect(button).not.toContain("text-amber");
  // No stage is expanded or selected. Its passive count must not look like
  // the one active red-pencil selection.
  expect(html).not.toContain('fill="var(--amber)"');
  // No stage is selected, so neither its passive rectangle nor the
  // prerequisite lines/count badges may use red-tinted aliases.
  expect(html).not.toContain('stroke="var(--amber)"');
  expect(html).not.toContain('stroke="var(--amber-line-2)"');
  expect(html).toContain('stroke="var(--line)"');
  expect(html).toContain('fill="var(--ink-3)"');
 });
});
