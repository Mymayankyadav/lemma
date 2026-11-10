import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
const tokens=JSON.parse(readFileSync("src/ui/v7/design-tokens.json","utf8"));
const c=(a:string,b:string)=>{
 const lum=(hex:string)=>{const [r,g,bl]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*bl;};
 const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
for(const mode of ["day","night","day-hc","night-hc"]){
 const raw=tokens.raw[mode.startsWith("day")?"day":"night"];
 const get=(role:string)=>raw[mode.endsWith("-hc")&&["text.secondary","text.tertiary"].includes(role)?"text.primary":mode.endsWith("-hc")&&role==="border.default"?"border.strong":role].$value;
 it(mode+" has accessible text, controls and focus",()=>{
  for(const text of ["text.primary","text.secondary","text.tertiary"])
   for(const bg of ["surface.page","surface.raised","surface.sunken","surface.muted","surface.overlay"])
    expect(c(get(text),get(bg)),text+" on "+bg).toBeGreaterThanOrEqual(4.5);
  for(const bg of ["surface.page","surface.raised","surface.sunken","surface.muted","surface.overlay"])
   expect(c(get("border.default"),get(bg)),bg).toBeGreaterThanOrEqual(3);
  expect(c(get("focus.ring"),get("surface.page"))).toBeGreaterThanOrEqual(3);
 });
}
it("uses one DTCG source with aliased components and 4 modes",()=>{
 for(const [name,value] of Object.entries(tokens.component) as [string,{$value:string}][])
  expect(value.$value,name).toMatch(/^\{role\./);
 expect(tokens.$extensions["lemma.modes"]).toEqual(["day","night","day-hc","night-hc"]);
});
