import {expect,test,type Locator} from '@playwright/test';

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
