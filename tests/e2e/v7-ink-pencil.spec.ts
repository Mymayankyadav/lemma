import {expect,test,type Locator,type Page} from '@playwright/test';

// Synthetic Pointer Events exercise both real Tutor entry points, not Apple hardware.
const url='/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
async function pointer(svg:Locator,type:string,pointerType:string,pointerId:number,x:number,y:number) {
  await svg.evaluate((node,args)=>{
    const rect=node.getBoundingClientRect();
    // Synthetic IDs are not active browser pointers, so capture itself is outside this test.
    node.setPointerCapture=()=>{};
    node.dispatchEvent(new PointerEvent(args.type,{bubbles:true,pointerType:args.pointerType,pointerId:args.pointerId,
      button:0,buttons:args.type==='pointerup'?0:1,clientX:rect.left+args.x,clientY:rect.top+args.y}));
  },{type,pointerType,pointerId,x,y});
}
for (const surface of ['scratch','equation']) for (const fullscreen of [false,true]) {
  test(`${surface} ${fullscreen?'full screen':'inline'}: Pencil replaces a palm preview and protects saved ink`,async({page})=>{
    await page.goto(url);
    await page.getByRole('button',{name:'Write a question'}).click();
    await page.getByRole('textbox',{name:'Your answer',exact:true}).focus();
    if(surface==='scratch') await page.getByRole('button',{name:'Scratch',exact:true}).click();
    else await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Equation mode',exact:true}).click();
    if(fullscreen) await page.getByRole('button',{name:'Full screen',exact:true}).click();
    const svg=page.locator('svg[data-ink-canvas]');
    await expect(svg).toBeVisible();
    const saved=svg.locator('path:not([data-live-stroke])');
    await pointer(svg,'pointerdown','mouse',1,10,20);
    await pointer(svg,'pointerup','mouse',1,70,20);
    const original=await saved.first().getAttribute('d');
    await pointer(svg,'pointerdown','touch',2,20,40);
    await pointer(svg,'pointermove','touch',2,100,40);
    await pointer(svg,'pointerdown','pen',3,20,80);
    // A stationary pen remains authoritative even beyond the former time-only heuristic.
    await page.waitForTimeout(900);
    await pointer(svg,'pointerdown','touch',4,120,100);
    await pointer(svg,'pointerdown','touch',5,150,100);
    await pointer(svg,'pointermove','touch',2,110,50);
    await pointer(svg,'pointermove','touch',4,140,120);
    await pointer(svg,'pointermove','touch',5,180,120);
    await pointer(svg,'pointermove','pen',3,90,80);
    await pointer(svg,'pointerup','pen',3,130,80);
    await pointer(svg,'pointerup','touch',2,110,50);
    await pointer(svg,'pointerup','touch',4,140,120);
    await pointer(svg,'pointerup','touch',5,180,120);
    await expect(saved).toHaveCount(2);
    await expect(saved.first()).toHaveAttribute('d',original!);
    const pencil=await saved.last().getAttribute('d');
    expect(pencil).not.toBe(original);
    if(fullscreen) {
      await page.getByRole('button',{name:'Exit full screen',exact:true}).click();
      await expect(saved).toHaveCount(2);
      await expect(saved.last()).toHaveAttribute('d',pencil!);
    }
  });
}

type Paper='scratch'|'equation';
type ContactEvent=[type:string,input:string,id:number,x:number,y:number];
const paths=(svg:Locator)=>svg.locator('path:not([data-live-stroke])');

async function openPaper(page:Page,paper:Paper,fullscreen=false) {
  const region=(kind:Paper)=>page.getByRole('region',{name:kind==='scratch'?'Scratch pad':'Equation mode',exact:true});
  const start=page.getByRole('button',{name:'Write a question'});
  const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
  await expect(start.or(answer).first()).toBeVisible();
  if(await start.isVisible()) await start.click();
  const other=region(paper==='scratch'?'equation':'scratch');
  if(await other.isVisible()) await other.getByRole('button',{name:'Keys',exact:true}).click();
  const paperRegion=region(paper);
  if(!await paperRegion.isVisible()) {
    await answer.focus();
    if(paper==='scratch') await page.getByRole('button',{name:'Scratch',exact:true}).click();
    else await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Equation mode',exact:true}).click();
  }
  if(fullscreen) await paperRegion.getByRole('button',{name:'Full screen',exact:true}).click();
  const svg=paperRegion.locator('svg[data-ink-canvas]');
  await expect(svg).toBeVisible();
  return {svg,paperRegion};
}

async function enterPaper(page:Page,paper:Paper,fullscreen=false) {
  await page.goto(url);
  return openPaper(page,paper,fullscreen);
}

async function spoofIPad(page:Page,desktop:boolean) {
  await page.addInitScript(({desktop})=>{
    Object.defineProperties(navigator,{
      userAgent:{get:()=>desktop
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
        : 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
      platform:{get:()=>desktop?'MacIntel':'iPad'},
      maxTouchPoints:{get:()=>5},
    });
  },{desktop});
}

async function dispatchContacts(svg:Locator,events:ContactEvent[]) {
  // Cluster the two physical contacts inside one browser task, not between Playwright commands.
  await svg.evaluate((node,events)=>{
    const rect=node.getBoundingClientRect();
    node.setPointerCapture=()=>{};
    for(const [type,pointerType,pointerId,x,y] of events) {
      node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType,pointerId,button:0,
        buttons:type==='pointerup'||type==='pointercancel'?0:1,clientX:rect.left+x,clientY:rect.top+y}));
    }
  },events);
}

const stroke=(input:string,id:number,y:number):ContactEvent[]=>[
  ['pointerdown',input,id,30,y],
  ['pointermove',input,id,55,y],
  ['pointerup',input,id,90,y],
];

for (const paper of ['scratch','equation'] as const) {
  test(`iPad ${paper}: Pencil-only ink rejects early touch and tip double-tap erases one stroke`,async({page})=>{
    await spoofIPad(page,paper==='equation');
    const {svg,paperRegion}=await enterPaper(page,paper,paper==='equation');
    const saved=paths(svg);
    await dispatchContacts(svg,stroke('touch',11,50));
    await dispatchContacts(svg,[['pointerdown','touch',11,30,65],['pointermove','touch',11,60,65],['pointercancel','touch',11,60,65]]);
    await expect(saved).toHaveCount(0);
    const viewport=paperRegion.locator(paper==='scratch'?'.tutor-scratch-paper':'.tutor-equation-paper');
    const before=await viewport.evaluate(node=>node.scrollLeft);
    await dispatchContacts(svg,[
      ['pointerdown','touch',11,160,50],['pointerdown','touch',13,230,85],
      ['pointermove','touch',11,140,50],['pointermove','touch',13,200,85],
      ['pointermove','touch',11,100,50],['pointerup','touch',11,100,50],['pointerup','touch',13,200,85],
    ]);
    await expect.poll(()=>viewport.evaluate(node=>node.scrollLeft)).toBeGreaterThan(before);
    await expect(saved).toHaveCount(0);
    await dispatchContacts(svg,[['pointerdown','pen',12,30,80],['pointermove','pen',12,55,80]]);
    await expect(svg.locator('[data-live-stroke]')).toHaveAttribute('d',/L/);
    await dispatchContacts(svg,[['pointerup','pen',12,90,80]]);
    await expect(saved).toHaveCount(1);
    const original=await saved.first().getAttribute('d');
    await dispatchContacts(svg,[
      ['pointerdown','pen',12,120,65],['pointerup','pen',12,120,65],
      ['pointerdown','pen',12,122,64],['pointerup','pen',12,122,64],
    ]);
    await expect(saved).toHaveCount(1);
    await expect(saved.first()).toHaveAttribute('d',original!);
    await expect(svg).toHaveAttribute('data-mode','eraser');
    await dispatchContacts(svg,stroke('pen',12,80));
    await expect(saved).toHaveCount(0);
    await expect(svg).toHaveAttribute('data-mode','pen');
    await dispatchContacts(svg,stroke('pen',12,85));
    await expect(saved).toHaveCount(1);
  });
}

test('iPad keeps a single Pencil dot when expanding the paper immediately',async({page})=>{
  await spoofIPad(page,false);
  const {svg}=await enterPaper(page,'scratch');
  await svg.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    const options={bubbles:true,pointerType:'pen',pointerId:21,button:0,clientX:rect.left+30,clientY:rect.top+50};
    node.setPointerCapture=()=>{};
    node.dispatchEvent(new PointerEvent('pointerdown',{...options,buttons:1}));
    node.dispatchEvent(new PointerEvent('pointerup',options));
    node.closest('section')!.querySelector<HTMLButtonElement>('[data-fullscreen-toggle]')!.click();
  });
  const full=page.getByRole('dialog',{name:'Scratch pad, full screen',exact:true});
  const fullCanvas=full.locator('svg[data-ink-canvas]');
  await expect(full).toBeVisible();
  await expect(paths(fullCanvas)).toHaveCount(1);
  await full.getByRole('button',{name:'Exit full screen',exact:true}).click();
  await expect(paths(svg)).toHaveCount(1);
});

test('Android still accepts finger ink on both Tutor papers',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperties(navigator,{
      userAgent:{get:()=> 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'},
      platform:{get:()=> 'Linux armv8l'},
      maxTouchPoints:{get:()=>5},
    });
    document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.nativeApp='';},{once:true});
  });
  for(const paper of ['scratch','equation'] as const) {
    const {svg,paperRegion}=paper==='scratch'?await enterPaper(page,paper):await openPaper(page,paper);
    await expect(paperRegion.getByRole('button',{name:'Apple Pencil only',exact:true})).toHaveCount(0);
    await dispatchContacts(svg,stroke('touch',30,80));
    await expect(paths(svg)).toHaveCount(1);
  }
});

test('iPad header Pencil-only setting is shared by both papers and survives reload',async({page})=>{
  await spoofIPad(page,true);
  const setting=(region:Locator)=>region.getByRole('button',{name:'Apple Pencil only',exact:true});
  const scratch=await enterPaper(page,'scratch');
  await expect(setting(scratch.paperRegion)).toHaveAttribute('aria-pressed','true');
  await setting(scratch.paperRegion).click();
  await expect(setting(scratch.paperRegion)).toHaveAttribute('aria-pressed','false');
  const equation=await openPaper(page,'equation',true);
  await expect(setting(equation.paperRegion)).toHaveAttribute('aria-pressed','false');
  await dispatchContacts(equation.svg,stroke('touch',31,80));
  await expect(paths(equation.svg)).toHaveCount(1);
  const restored=await enterPaper(page,'scratch');
  await expect(setting(restored.paperRegion)).toHaveAttribute('aria-pressed','false');
  await dispatchContacts(restored.svg,stroke('touch',31,80));
  await expect(paths(restored.svg)).toHaveCount(1);
  await setting(restored.paperRegion).click();
  await expect(setting(restored.paperRegion)).toHaveAttribute('aria-pressed','true');
  await dispatchContacts(restored.svg,stroke('touch',31,100));
  await expect(paths(restored.svg)).toHaveCount(1);
});

test('iPad long-press eraser choice switches between pixel cuts and whole strokes',async({page})=>{
  await spoofIPad(page,false);
  const {svg,paperRegion}=await enterPaper(page,'scratch');
  const saved=paths(svg);
  await dispatchContacts(svg,stroke('pen',40,80));
  await expect(saved).toHaveCount(1);
  const eraser=paperRegion.getByRole('button',{name:'Eraser',exact:true});
  const box=(await eraser.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  const pixel=paperRegion.getByRole('button',{name:'Pixel eraser',exact:true});
  await expect(pixel).toBeVisible();
  await page.mouse.up();
  await pixel.click();
  await expect(svg).toHaveAttribute('data-mode','eraser');
  const erase=(x:number):ContactEvent[]=>[
    ['pointerdown','pen',41,x,62],['pointermove','pen',41,x,75],['pointerup','pen',41,x,97],
  ];
  await dispatchContacts(svg,erase(60));
  await expect(saved).toHaveCount(2);
  await paperRegion.getByRole('button',{name:'Eraser type',exact:true}).click();
  await paperRegion.getByRole('button',{name:'Whole stroke',exact:true}).click();
  await dispatchContacts(svg,erase(31));
  await expect(saved).toHaveCount(1);
  await dispatchContacts(svg,erase(88));
  await expect(saved).toHaveCount(0);
});

test('phone equation header keeps eraser controls off the writing area',async({page})=>{
  await page.setViewportSize({width:393,height:873});
  const {svg,paperRegion}=await enterPaper(page,'equation');
  const paper=paperRegion.locator('.tutor-equation-paper');
  const box=(await paper.boundingBox())!;
  // Use real hit testing and the same upper-paper start that was covered by
  // the widened floating toolbar. A synthetic event sent to SVG would miss it.
  const x=box.x+8+0.75*(box.width*0.6-16);
  const y=box.y+6+0.1*(box.height-12);
  const draw=async()=>{
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x,box.y+box.height-16,{steps:6});
    await page.mouse.up();
  };
  await draw();
  await expect(paths(svg)).toHaveCount(1);

  // Keyboard access still changes the paper tool without widening the floating actions.
  const type=paperRegion.getByRole('button',{name:'Eraser type',exact:true});
  await type.focus();
  await page.keyboard.press('Enter');
  const options=page.getByRole('dialog',{name:'Eraser types',exact:true});
  await expect(options).toBeVisible();
  await options.getByRole('button',{name:'Whole stroke',exact:true}).click();
  await expect(svg).toHaveAttribute('data-mode','eraser');
  await draw();
  await expect(paths(svg)).toHaveCount(0);
  await paperRegion.getByRole('button',{name:'Pen',exact:true}).click();
  await expect(svg).toHaveAttribute('data-mode','pen');
  await draw();
  await expect(paths(svg)).toHaveCount(1);
});
