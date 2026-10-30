import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/atlas')
})

test('Atlas renders the whole knowledge graph, status filters and zoom controls',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await expect(page.getByRole('heading',{name:'Atlas',level:1})).toBeVisible()
 await expect(page.getByRole('group',{name:/Interactive knowledge graph/})).toBeVisible()
 await expect(page.locator('[data-node]')).toHaveCount(22)
 await expect(page.getByRole('button',{name:/Revisit \d+/})).toBeVisible()
 await page.getByRole('button',{name:/Revisit \d+/}).click()
 await expect(page.getByRole('button',{name:/Revisit \d+/})).toHaveAttribute('aria-pressed','true')
 const layer=page.locator('svg[aria-label^="Interactive knowledge graph"] > g').first()
 const original=await layer.getAttribute('transform')
 await page.getByRole('button',{name:'Zoom in'}).click()
 await expect.poll(()=>layer.getAttribute('transform')).not.toBe(original)
 await page.getByRole('button',{name:'Fit graph'}).click()
 await page.screenshot({path:'test-results/screens/atlas-graph.png',fullPage:true})
 expect(errors).toEqual([])
})

test('URL focus selects the concept and opens its checkpoint',async({page})=>{
 await page.goto('./?demo=1#/atlas?focus=compactness')
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible()
 await expect(page.getByText('In progress',{exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:/Open checkpoint/})).toHaveAttribute('href',/#\/p\/real-analysis\/cp\/CP4$/)
 await page.screenshot({path:'test-results/screens/atlas-selected.png',fullPage:true})
 await page.getByRole('button',{name:'Close concept details'}).click()
 await expect(page).not.toHaveURL(/focus=compactness/)
})

test('dragging a concept pins and long-press offers unpin',async({page})=>{
 const node=page.locator('[data-node="concept-open-sets"]')
 await expect(node).toBeVisible()
 const b=await node.boundingBox()
 expect(b).not.toBeNull()
 const x=b!.x+b!.width/2,y=b!.y+b!.height/2
 await page.mouse.move(x,y)
 await page.mouse.down()
 await page.mouse.move(x+44,y+27,{steps:8})
 await page.mouse.up()
 await expect(page.getByText('Position pinned')).toBeVisible()
 const b2=await node.boundingBox()
 expect(b2).not.toBeNull()
 await page.mouse.move(b2!.x+b2!.width/2,b2!.y+b2!.height/2)
 await page.mouse.down()
 await page.waitForTimeout(750)
 await page.mouse.up()
 await expect(page.getByRole('button',{name:'Unpin'})).toBeVisible()
 await page.getByRole('button',{name:'Unpin'}).click()
 await expect(page.getByText('Concept unpinned')).toBeVisible()
})

test('Atlas fits node centres between overlays and avoids overlapping labels', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 const svg = page.getByRole('group',{name:/Interactive knowledge graph/});
 await expect(page.locator('[data-node]')).toHaveCount(22);
 await expect.poll(async()=>svg.locator(':scope > g').first().getAttribute('transform')).not.toBeNull();
 const geometry = await page.locator('[data-node]').evaluateAll(nodes =>
  nodes.map(node => {
   const circle=node.querySelector('circle');
   const svg=(node as SVGGElement).ownerSVGElement!;
   const point=svg.createSVGPoint();
   point.x=Number(circle?.getAttribute('cx'));
   point.y=Number(circle?.getAttribute('cy'));
   const centre=point.matrixTransform((node as SVGGElement).getScreenCTM()!);
   return {x:centre.x,y:centre.y};
  }));
 expect(geometry).toHaveLength(22);
 for (const centre of geometry) {
  expect(centre.x).toBeGreaterThanOrEqual(23);
  expect(centre.x).toBeLessThanOrEqual(367);
  expect(centre.y).toBeGreaterThanOrEqual(145);
  expect(centre.y).toBeLessThanOrEqual(716);
 }
 const labels=await page.locator('[data-node] text').evaluateAll(elements =>
  elements.map(element=>{
   const rect=element.getBoundingClientRect();
   return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
  }));
 expect(labels.length).toBeGreaterThan(3);
 expect(labels.length).toBeLessThan(22);
 for (let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
  const a=labels[i],b=labels[j];
  const overlap=Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 &&
   Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  expect(overlap).toBe(false);
 }
 await page.screenshot({path:'test-results/screens/atlas-fitted-mobile.png',fullPage:true});
 await page.goto('./?demo=1#/atlas?focus=compactness');
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible();
 await expect(page.locator('[data-node="concept-compactness"] text')).toBeVisible();
 await page.screenshot({path:'test-results/screens/atlas-fitted-selected.png',fullPage:true});
});

test('Euclid Atlas switches Orbits, Branches and Outline without losing concept selection',async({page})=>{
 await page.goto('./?demo=1&theme=graph#/atlas');
 await expect(page.getByRole('group',{name:'Atlas view'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Move Atlas viewport'})).toBeVisible();
 // Record the unpanned initial state separately. The later drag intentionally
 // pans the viewport and should not be used to judge fit/label clipping.
 await expect(page.locator('[data-atlas-ring]')).toHaveCount(6);
 await page.screenshot({path:'test-results/screens/atlas-euclid-orbits-initial.png',fullPage:true});
 const graph=page.locator('svg[aria-label^="Interactive knowledge graph"] > g').first();
 const before=await graph.getAttribute('transform');
 await page.getByRole('button',{name:'Move Atlas viewport'}).click({position:{x:83,y:23}});
 await expect.poll(()=>graph.getAttribute('transform')).not.toBe(before);
 const minimap=page.getByRole('button',{name:'Move Atlas viewport'});
 const box=await minimap.boundingBox();
 expect(box).not.toBeNull();
 const clicked=await graph.getAttribute('transform');
 await page.mouse.move(box!.x+22,box!.y+22);
 await page.mouse.down();
 await page.mouse.move(box!.x+76,box!.y+75,{steps:5});
 await page.mouse.up();
 await expect.poll(()=>graph.getAttribute('transform')).not.toBe(clicked);
 await page.screenshot({path:'test-results/screens/atlas-euclid-orbits-panned.png',fullPage:true});

 await page.getByRole('button',{name:'Branches'}).click();
 await expect(page.locator('[data-atlas-mode="branches"]')).toBeVisible();
 await expect(page.locator('[data-atlas-subject]')).toHaveCount(3);
 await expect(page.locator('[data-atlas-topic]').first()).toBeVisible();
 await page.screenshot({path:'test-results/screens/atlas-euclid-branches.png',fullPage:true});

 await page.getByRole('button',{name:'Outline'}).click();
 await expect(page.locator('[data-atlas-mode="outline"]')).toBeVisible();
 await expect(page.locator('[data-atlas-idea]')).toHaveCount(22);
 await page.getByRole('button',{name:/Compactness, In progress/}).click();
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible();
 await expect(page).toHaveURL(/focus=compactness/);
 await page.getByRole('button',{name:'Close concept details'}).click();
 await page.getByRole('button',{name:/Revisit \d+/}).click();
 await expect(page.locator('[data-atlas-idea]').first()).toBeVisible();
 await page.screenshot({path:'test-results/screens/atlas-euclid-outline.png',fullPage:true});
 await page.reload();
 await expect(page.locator('[data-atlas-mode="outline"]')).toBeVisible();
});

test('Atlas list modes remain legible in Euclid night on a narrow phone',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=1&theme=graph-night#/atlas?view=outline');
 await expect(page.locator('[data-atlas-mode="outline"]')).toBeVisible();
 await expect(page.locator('[data-atlas-idea]')).toHaveCount(22);
 await expect(page.evaluate(()=>document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(360);
 await page.screenshot({path:'test-results/screens/atlas-euclid-night-outline.png',fullPage:true});
 await page.getByRole('button',{name:'Branches'}).click();
 await page.screenshot({path:'test-results/screens/atlas-euclid-night-branches.png',fullPage:true});
});

test('Euclid Atlas semantic zoom opens subject and topic breadcrumbs and returns to full fit',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('./?demo=1&theme=graph#/atlas');
 const graph=page.locator('svg[aria-label^="Interactive knowledge graph"] > g').first();
 await expect(page.locator('[data-atlas-subject-focus]')).toHaveCount(3);
 const old=await graph.getAttribute('transform');
 const subject=page.locator('[data-atlas-subject-focus]').first();
 await expect(subject).toHaveAttribute('role','button');
 await subject.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('navigation',{name:'Atlas breadcrumb'})).toBeVisible();
 await expect.poll(()=>graph.getAttribute('transform')).not.toBe(old);
 const topic=page.locator('[data-atlas-topic-focus]').first();
 await expect(topic).toBeVisible();
 await topic.click();
 await expect(page.getByRole('navigation',{name:'Atlas breadcrumb'})).toContainText('General');
 await page.screenshot({path:'test-results/screens/atlas-euclid-topic-focus.png',fullPage:true});
 await page.getByRole('navigation',{name:'Atlas breadcrumb'}).getByRole('button',{name:'All'}).click();
 await expect(page.getByRole('navigation',{name:'Atlas breadcrumb'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


for(const world of ['graph','graph-night'] as const){
 test(`Atlas semantic focus keeps labels clear of overlays: ${world}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`./?demo=1&theme=${world}#/atlas`);
  const subject=page.locator('[data-atlas-subject-focus]').first();
  await expect(subject).toBeVisible();
  await subject.focus();
  await page.keyboard.press('Enter');
  const breadcrumb=page.getByRole('navigation',{name:'Atlas breadcrumb'});
  await expect(breadcrumb).toBeVisible();

  const header=await page.locator('main[aria-label="Atlas"] > header').boundingBox();
  const crumb=await breadcrumb.boundingBox();
  const subjectLabel=await subject.locator('text').boundingBox();
  expect(header).not.toBeNull();
  expect(crumb).not.toBeNull();
  expect(subjectLabel).not.toBeNull();
  expect(subjectLabel!.y).toBeGreaterThan(Math.max(
   header!.y+header!.height,crumb!.y+crumb!.height
  )+8);
  await page.screenshot({path:`test-results/screens/atlas-${world}-subject-focus-clear.png`,fullPage:true});

  const topicButton=breadcrumb.locator('[data-atlas-topic-focus]').first();
  const topicId=await topicButton.getAttribute('data-atlas-topic-focus');
  expect(topicId).toBeTruthy();
  await topicButton.click();
  await expect(breadcrumb).toContainText('General');
  const topicLabel=await page.locator('svg [data-atlas-topic-focus]').filter({
   has:page.locator('text')
  }).first().locator('text').boundingBox();
  const details=await page.locator('[data-atlas-details]').boundingBox();
  const crumbAfter=await breadcrumb.boundingBox();
  expect(topicLabel).not.toBeNull();
  expect(details).not.toBeNull();
  expect(crumbAfter).not.toBeNull();
  expect(topicLabel!.y).toBeGreaterThan(crumbAfter!.y+crumbAfter!.height+8);
  expect(topicLabel!.y+topicLabel!.height).toBeLessThan(details!.y-8);
  await page.screenshot({path:`test-results/screens/atlas-${world}-topic-focus-clear.png`,fullPage:true});
 });
}
