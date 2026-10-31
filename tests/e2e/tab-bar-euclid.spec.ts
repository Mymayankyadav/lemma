import {test,expect} from '@playwright/test';

// v3: the navigation is a full-width dock, not the old floating Euclid pill.
for(const world of ['graph','graph-night'] as const){
 test(`UI-6a ${world} tab dock is flush, icon-first and clears the last action`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`./?demo=1&theme=${world}#/`);
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link',{name:'Today'})).toHaveAttribute('aria-current','page');
  await expect(nav.getByText('Today',{exact:true})).toBeVisible();
  await expect(nav.getByText('Paths',{exact:true})).toHaveCount(0);
  await expect(nav.getByText('Review',{exact:true})).toHaveCount(0);
  await expect(nav.getByText('Insights',{exact:true})).toHaveCount(0);
  await expect(nav.getByRole('link',{name:'Review'}).getByText('23')).toBeVisible();
  const dock=await nav.evaluate(el=>{
   const css=getComputedStyle(el),rect=el.getBoundingClientRect();
   const targets=[...el.querySelectorAll('a')].map(a=>a.getBoundingClientRect());
   return {left:rect.left,right:rect.right,bottom:rect.bottom,radius:css.borderRadius,
    blur:css.backdropFilter,position:css.position,targets:targets.map(r=>({w:r.width,h:r.height}))};
  });
  expect(dock.left).toBe(0);
  expect(dock.right).toBe(360);
  expect(dock.bottom).toBe(740);
  expect(dock.radius).toBe('0px');
  expect(dock.blur).toBe('none');
  expect(dock.position).toBe('fixed');
  for(const target of dock.targets){expect(target.w).toBeGreaterThanOrEqual(44);expect(target.h).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:`test-results/screens/review/ui6a-dock-${world}-today.png`,fullPage:true});
  await page.goto('./?demo=1#/projects');
  await expect(nav.getByRole('link',{name:'Paths'})).toHaveAttribute('aria-current','page');
  await expect(nav.getByText('Paths',{exact:true})).toBeVisible();
  await expect(nav.getByText('Today',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const overlap=await page.evaluate(()=>{
   const top=document.querySelector('nav[aria-label="Main navigation"]')!.getBoundingClientRect().top;
   const controls=[...document.querySelectorAll<HTMLElement>('#main-content button,#main-content a[href]')].filter(el=>{
    const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight;
   });
   return controls.some(el=>{const r=el.getBoundingClientRect();return r.bottom>top+1&&r.top<top;});
  });
  expect(overlap).toBe(false);
  await page.screenshot({path:`test-results/screens/review/ui6a-dock-${world}-paths.png`,fullPage:true});
 });
}
