// FIX #293 claim: viewport fit and overlapping label regression.
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
