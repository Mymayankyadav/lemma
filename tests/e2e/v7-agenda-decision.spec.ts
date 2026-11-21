import {expect,test} from '@playwright/test'
import {at,NOW} from './v7-scenes'
test('Today shows the recommendation and Diagnostics reflects a saved Legacy preference',async({page})=>{
  await page.clock.setFixedTime(NOW)
  const route=(path:string)=>at(path).replace('#',',todayNextStep#')
  await page.goto(route('/'))
  const next=page.getByRole('region',{name:'Your next step'})
  await expect(next).toHaveCount(1)
  await next.getByRole('button',{name:'Why this',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Why this',exact:true})).toBeVisible()
  await page.goto(route('/settings?section=advanced'))
  const decision=page.getByRole('button',{name:'Decision details',exact:true})
  const algorithm=page.getByRole('definition').filter({hasText:/^(new|legacy)$/})
  await expect(decision).toHaveAttribute('aria-expanded','true')
  await expect(algorithm).toHaveText('new')
  await page.goto(route('/settings?section=planning'))
  await page.getByRole('button',{name:/Scheduling algorithm/}).click()
  await page.getByRole('radio',{name:/^Legacy/}).click()
  await expect(page.getByRole('button',{name:/Scheduling algorithm/})).toContainText('Legacy')
  await page.goto(route('/'))
  await expect(next).toHaveCount(1)
  await expect(decision).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Study model'}).getByRole('list')).toHaveCount(0)
  await page.goto(route('/settings?section=advanced'))
  await expect(algorithm).toHaveText('legacy')
})

for(const atlasEnabled of [true,false]){
  test(`Today opens the scheduler's Linear Algebra checkpoint with Atlas ${atlasEnabled?'on':'off'}`,async({page})=>{
    await page.clock.setFixedTime(NOW)
    await page.addInitScript(({startsAt,endsAt})=>{
      sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[{
        id:'linear-study-window',kind:'study',title:'Linear Algebra study time',startsAt,endsAt,timeZone:'Asia/Kolkata',
        status:'planned',version:1,projectId:'project-linear',subjectId:'subject-linear',checkpointId:null,sessionId:null,
      }]}))
    },{startsAt:new Date(+NOW-5*60_000).toISOString(),endsAt:new Date(+NOW+45*60_000).toISOString()})
    await page.goto(at('/').replace('#',`,todayNextStep${atlasEnabled?'':',-atlasV3'}#`))
    const next=page.getByRole('region',{name:'Your next step'})
    await expect(next).toBeVisible({timeout:12_000})
    await expect(page.getByRole('region',{name:'Continue'}).locator('.v7-today-tile').first()).toHaveAttribute('href','#/p/real-analysis')
    const tutor=next.getByRole('link',{name:'Start with tutor',exact:true})
    await expect(next.getByRole('heading',{name:'Learn · Eigenvalues',exact:true})).toBeVisible()
    await expect(tutor).toHaveAttribute('href','#/p/linear-algebra/cp/CP9/tutor')
    await expect(next.locator('a[href*="real-analysis"]')).toHaveCount(0)
    await next.getByRole('button',{name:'Why this',exact:true}).click()
    const why=page.getByRole('dialog',{name:'Why this',exact:true})
    await expect(why).toContainText('Diagonalization is next on Linear Algebra.')
    await page.keyboard.press('Escape')
    await tutor.click()
    await expect(page.getByRole('heading',{name:'Linear Algebra · CP9 · Diagonalization',exact:true})).toBeVisible()
  })
}
