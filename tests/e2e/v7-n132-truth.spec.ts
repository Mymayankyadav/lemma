import {test,expect,type Page} from "@playwright/test";
import {NOW,at} from "./v7-scenes";
// N132 · v7 UX audit r3, the rest of phase U0 (truth), on the audit seed with the clock frozen. The ids are the audit's
// (docs/v7/ux-audit-2026-11-12/01_AUDIT_RELEASED_V7.md).
test.use({locale:"en-IN",timezoneId:"Asia/Kolkata",colorScheme:"dark"});
async function open(page:Page,hash:string,{width=390,scheme="dark" as "dark"|"light"}={}){
 await page.setViewportSize({width,height:844});
 await page.emulateMedia({colorScheme:scheme});
 await page.clock.setFixedTime(NOW);
 await page.goto(at(hash));
 await expect(page.locator("html")).toHaveAttribute("data-v7","");
 await page.waitForLoadState("networkidle");
}
const rgb=(value:string)=>value.match(/\d+(\.\d+)?/g)!.slice(0,3).map(Number);
const luminance=([r,g,b]:number[])=>{const c=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const contrast=(a:string,b:string)=>{const [x,y]=[luminance(rgb(a)),luminance(rgb(b))].sort((p,q)=>q-p);return (x+.05)/(y+.05);};

test("V14 · after scrolling, Capture stays and the dock is symmetric",async({page})=>{
 await open(page,"/");
 // Scroll down in steps, as a finger does (Capture used to fade out on the way down).
 for(let y=150;y<=750;y+=150){await page.evaluate(top=>window.scrollTo(0,top),y);await page.waitForTimeout(60);}
 await page.waitForTimeout(300);
 const box=await page.evaluate(()=>{const r=(s:string)=>document.querySelector(s)!.getBoundingClientRect();
  return {dock:r(".v7-dock"),tabs:r(".v7-tabbar"),capture:r(".v7-capture"),opacity:getComputedStyle(document.querySelector(".v7-capture")!).opacity,y:scrollY};});
 expect(box.y).toBeGreaterThan(100);
 expect(box.opacity).toBe("1");
 const content=(box.tabs.left+box.capture.right)/2,dock=(box.dock.left+box.dock.right)/2;
 expect(Math.abs(content-dock)).toBeLessThanOrEqual(1);
});

for(const scheme of ["dark","light"] as const)test(`V15 · ${scheme==="dark"?"Night":"Day"}: every heat step's numeral is at least 4.5 : 1`,async({page})=>{
 await open(page,"/calendar?view=month&date=2026-11-09",{scheme});
 const days=await page.locator(".v7-mo-grid button[data-tint]:not([data-outside])").evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node);return {tint:node.getAttribute("data-tint"),ink:style.color,paper:style.backgroundColor};}));
 const tinted=days.filter(day=>day.tint!=="0"&&!/rgba\(0, 0, 0, 0\)/.test(day.paper));
 expect(tinted.length).toBeGreaterThan(0);
 for(const day of tinted)expect(contrast(day.ink,day.paper),"step "+day.tint).toBeGreaterThanOrEqual(4.5);
});

test("V42 · days outside the month are dimmed and week blocks show a title on a phone",async({page})=>{
 await open(page,"/calendar?view=month&date=2026-11-09");
 const outside=page.locator(".v7-mo-grid button[data-outside]").first();
 await expect(outside).toBeVisible();
 expect(await outside.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
 expect(await outside.evaluate(node=>getComputedStyle(node).boxShadow)).toBe("none");
 await open(page,"/calendar?view=week&date=2026-11-09");
 const shorts=page.locator(".v7-wk-short:visible");
 expect(await shorts.count()).toBeGreaterThan(0);
 expect((await shorts.first().innerText()).trim().length).toBeGreaterThan(0);
});

test("V16 · the almanac opens with today in view and one tab stop on today",async({page})=>{
 await open(page,"/insights");
 const almanac=page.locator(".v7-heatmap-scroll");
 await expect(almanac).toBeVisible();
 const cells=almanac.locator("[data-chart-point]");
 expect(await cells.count()).toBeLessThan(182);
 const today=almanac.locator('[aria-current="date"]');
 await expect(today).toHaveAttribute("tabindex","0");
 expect(await almanac.locator('[data-chart-point][tabindex="0"]').count()).toBe(1);
 const view=(await almanac.boundingBox())!,cell=(await today.boundingBox())!;
 expect(cell.x).toBeGreaterThanOrEqual(view.x-1);
 expect(cell.x+cell.width).toBeLessThanOrEqual(view.x+view.width+1);
});

test("V18 · the learning screens print names, not codes",async({page})=>{
 const codes=async()=>[...new Set([...(await page.evaluate(()=>document.body.innerText)).matchAll(/\b(CP\d+[a-z]?|S\d+)\b/g)].map(match=>match[0]))];
 for(const hash of ["/p/real-analysis/cp/CP4","/p/real-analysis","/s/real-analysis/7","/cards/1"]){
  await open(page,hash);
  expect(await codes(),hash).toEqual([]);
 }
 await open(page,"/p/real-analysis/cp/CP4");
 await page.mouse.wheel(0,600);
 await expect(page.locator(".v7-detail-header")).not.toContainText(/CP\d/);
 await open(page,"/proposals?tab=plan");
 await page.locator(".v7-inbox-plan").first().getByRole("link",{name:"Compare whole plan"}).click();
 await expect(page.getByRole("heading",{level:1,name:"What changes"})).toBeVisible();
 expect(await codes()).toEqual([]);
});

test("V32 · an unknown address says so, with Search and Today",async({page})=>{
 await open(page,"/no-such-page/42");
 await expect(page.getByText("This page isn't in the notebook.",{exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Go to Today"})).toBeVisible();
 await page.locator(".v7-not-found-actions").getByRole("button",{name:"Search"}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.keyboard.press("Escape");
 await page.getByRole("link",{name:"Go to Today"}).click();
 await expect(page).toHaveURL(/#\/$/);
});

test("V33 · the first two screens of the card library repeat no card",async({page})=>{
 await open(page,"/cards");
 const fronts=await page.locator("main li").evaluateAll(nodes=>nodes.filter(node=>{const box=node.getBoundingClientRect();return box.height>0&&box.top<2*innerHeight;})
  .map(node=>(node.querySelector("a span, a strong, a")?.textContent??"").trim()).filter(Boolean));
 expect(fronts.length).toBeGreaterThan(5);
 expect(new Set(fronts).size).toBe(fronts.length);
});

test("V34 · copy: time zone, subject rows, tutor tile, one duration format",async({page})=>{
 await open(page,"/settings?section=reminders");
 await expect(page.getByText("Times are in India Standard Time.",{exact:true})).toBeVisible();
 await open(page,"/settings?section=subjects");
 await expect(page.getByRole("main")).not.toContainText("glyph");
 await open(page,"/insights?tab=learning");
 await expect(page.getByText("Tutor sessions",{exact:true})).toBeVisible();
 await expect(page.getByRole("main")).not.toContainText("in tutor sessions");
 for(const hash of ["/insights","/insights?tab=time"]){
  await open(page,hash);
  for(const sentence of await page.locator(".v7-chart-summary").allTextContents())expect(sentence,hash).not.toMatch(/\d\.\d h\b/);
 }
});

test("V34 · the card editor starts with fraction, sum, integral and set braces",async({page})=>{
 await open(page,"/cards?new=1");
 const sheet=page.getByRole("dialog",{name:"New card"});
 await expect(sheet).toBeVisible();
 const keys=await sheet.locator("button[aria-label]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("aria-label")??""));
 const first=keys.filter(label=>/fraction|sum|integral|set braces|macro|inline maths|for all/.test(label)).slice(0,4);
 expect(first).toEqual(expect.arrayContaining(["Insert fraction","Insert sum","Insert integral","Insert set braces"].map(label=>expect.stringMatching(new RegExp(label.replace("Insert ",""),"i")))));
 expect(keys.join(" ")).not.toMatch(/newcommand|DeclareMathOperator/);
});

for(const scheme of ["dark","light"] as const)test(`V35 · ${scheme==="dark"?"Night":"Day"}: the cloze highlight is a selection, not a danger`,async({page})=>{
 await open(page,"/proposals?view=list",{scheme});
 const cloze=page.locator(".cz").first();
 await expect(cloze).toBeVisible();
 const tones=await cloze.evaluate(node=>{const root=getComputedStyle(document.documentElement),style=getComputedStyle(node);
  const probe=document.createElement("span");document.body.append(probe);
  const resolve=(value:string)=>{probe.style.color=value;const out=getComputedStyle(probe).color;return out;};
  const out={ink:style.color,selection:resolve(root.getPropertyValue("--v7-role-selection-fg")),danger:resolve(root.getPropertyValue("--v7-role-status-danger"))};probe.remove();return out;});
 expect(tones.ink).toBe(tones.selection);
 expect(tones.ink).not.toBe(tones.danger);
});

test("V37 · the three triage buttons are one size with labels on one baseline",async({page})=>{
 await open(page,"/proposals");
 const group=page.getByRole("group",{name:"Decide on this card"});
 const sizes=await group.locator(".v7-inbox-round").evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return [Math.round(box.width),Math.round(box.height),Math.round(box.top)];}));
 expect(sizes).toHaveLength(3);
 expect(new Set(sizes.map(size=>size.join("x"))).size).toBe(1);
 const labels=await group.locator("small").evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().bottom)));
 expect(new Set(labels).size).toBe(1);
});

test("V38 · Card detail: the date on one line, and Review now when the card is due",async({page})=>{
 await open(page,"/cards/1",{width:360});
 const next=page.locator(".v7-card-stats .v7-figure-m").first();
 const lines=await next.evaluate(node=>Math.round(node.getBoundingClientRect().height/parseFloat(getComputedStyle(node).lineHeight)));
 expect(lines).toBe(1);
 const bar=page.getByRole("group",{name:"Card actions"});
 await expect(bar.getByRole("link",{name:"Review now"})).toHaveAttribute("href",/#\/review\?path=real-analysis$/);
 await expect(bar.getByRole("link",{name:"Review now"})).toHaveClass(/v7-primary/);
 await expect(bar.getByRole("button",{name:"Edit card"})).not.toHaveClass(/v7-primary/);
});

test("V39 · the sign-in drawing never crosses the links or the note",async({page})=>{
 await open(page,"/sign-in");
 const backs=await page.evaluate(()=>({page:getComputedStyle(document.body).backgroundColor,actions:getComputedStyle(document.querySelector(".v7-signin-actions")!).backgroundColor}));
 expect(backs.actions).toBe(backs.page);
});

test("V40 · a thing to revisit is resolved by an action that says so",async({page})=>{
 await open(page,"/s/real-analysis/7");
 const revisit=page.getByRole("region",{name:"Things to revisit"});
 await expect(revisit.getByRole("button",{name:"Mark resolved"}).first()).toBeVisible();
 await expect(revisit.getByRole("button",{name:"Resolved",exact:true})).toHaveCount(0);
});

test("V43 · Data and account: grouped lists in the kit's sizes, one backup button, deletion in a sheet",async({page})=>{
 await open(page,"/settings?section=data");
 const main=page.getByRole("main");
 for(const group of ["Account","Export","Delete account"])await expect(main.getByRole("region",{name:group,exact:true})).toBeVisible();
 // It said "Download a backup" three times in one card; now once on the page (the closed sheet offers it again).
 await expect(main.getByRole("button",{name:/Download a backup/})).toHaveCount(1);
 const small=await main.evaluate(root=>[...root.querySelectorAll("*")].filter(node=>node.childNodes.length&&[...node.childNodes].some(child=>child.nodeType===3&&child.textContent!.trim())&&!node.closest(".v7-eyebrow,.v7-caption,.v7-set-note,.v7-sr-only"))
  .map(node=>({text:node.textContent!.trim().slice(0,30),size:parseFloat(getComputedStyle(node).fontSize)})).filter(item=>item.size<14));
 expect(small).toEqual([]);
 // No bare 13 px native checkbox: any checkbox is the kit's (a styled input inside .v7-check-choice).
 expect(await main.locator('input[type="checkbox"]').evaluateAll(nodes=>nodes.filter(node=>!node.closest(".v7-check-choice")).length)).toBe(0);
 await main.getByRole("button",{name:"Delete…"}).click();
 const sheet=page.getByRole("dialog",{name:"Delete your account?"});
 await expect(sheet).toBeVisible();
 await expect(sheet.locator(".v7-check-choice")).toHaveCount(1);
 await expect(sheet.getByRole("textbox",{name:"Type delete confirmation"})).toBeVisible();
 await expect(sheet.getByRole("button",{name:"Delete account permanently"})).toBeDisabled();
});
