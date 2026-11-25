import {expect,test,type Page} from '@playwright/test'
import {copyFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'

const url=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell,examMode#'+path
const viewports=[{width:320,height:640},{width:390,height:844},{width:844,height:390}]
const layout=async(page:Page)=>{
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1)
 expect(await page.locator('#main-content *').count()).toBeLessThan(1500)
}
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,16)

for(const viewport of viewports){
 test.describe(viewport.width+'px',()=>{
  test.use({viewport})
  test('sets up a planned sitting, opens its ledger and switches modes',async({page})=>{
   await page.goto(url('/p/real-analysis'))
   await page.getByRole('button',{name:'More path actions'}).click()
   await page.getByRole('menuitem',{name:'Prepare for an exam…'}).click()
   const setup=page.getByRole('dialog',{name:'Prepare for an exam'})
   await setup.getByLabel('Exam title').fill('Analysis midterm')
   await setup.getByLabel('Exam date and start time').fill(future(10))
   await expect(setup.getByLabel('Start prep now')).not.toBeChecked()
   await setup.getByRole('button',{name:'Add row',exact:true}).click()
   const row=page.getByRole('dialog',{name:'Add blueprint row'})
   await row.getByLabel('Scored task family').fill('Prove that compact sets are closed')
   await row.getByLabel('Marks',{exact:true}).fill('15')
   await row.getByRole('button',{name:'Add row',exact:true}).click()
   await setup.getByRole('button',{name:'Save exam'}).click()
   await expect(page.getByRole('tabpanel',{name:'Exam'})).toBeVisible()
   await expect(page.getByRole('button',{name:/Prove that compact sets are closed/})).toBeVisible()
   await expect(page.getByText('Study next',{exact:true})).toBeVisible()
   await expect(page.getByText('Exam next',{exact:true})).toBeVisible()
   const start=page.getByRole('button',{name:'Start prep'})
   expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44)
   await start.click()
   await expect(page.getByRole('button',{name:'Exam prep',exact:true})).toHaveAttribute('aria-pressed','true')
   await page.getByRole('button',{name:'Study',exact:true}).click()
   await expect(page.getByRole('tab',{name:'Plan'})).toHaveAttribute('aria-selected','true')
   await expect(page.getByText('Exam prep paused')).toBeVisible()
   await layout(page)
  })
  test('shows conflict and evidence separately from defer and pin',async({page})=>{
   await page.goto(url('/p/linear-algebra?tab=exam'))
   await expect(page.getByRole('heading',{name:'Coverage conflict'})).toBeVisible()
   const secure=page.getByRole('button',{name:/Write the matrix of a linear transformation/})
   await secure.click()
   await expect(secure).toContainText('Secure')
   await page.getByRole('button',{name:'Defer…'}).click()
   const edit=page.getByRole('dialog',{name:'Defer row'})
   await edit.getByRole('button',{name:'No time'}).click()
   await edit.getByLabel('Reopen when').fill('After the mock exam')
   await edit.getByRole('button',{name:'Save',exact:true}).click()
   await expect(secure).toContainText('Defer')
   await expect(secure).toContainText('Secure')
   await expect(page.getByText('After the mock exam')).toBeVisible()
   await page.getByRole('button',{name:'Pin',exact:true}).click()
   await expect(secure).toContainText('Pin')
   await page.getByRole('button',{name:'Edit row'}).click()
   const row=page.getByRole('dialog',{name:'Edit blueprint row'})
   await row.getByLabel('Marks',{exact:true}).fill('13')
   await row.getByRole('button',{name:'Save row'}).click()
   await expect(secure).toContainText('13 marks')
   await layout(page)
  })
 })
}

test('a past start can be dismissed, rescheduled or confirmed',async({page})=>{
 await page.goto(url('/p/real-analysis'))
 async function makePast(title:string){
  await page.getByRole('button',{name:'More path actions'}).click()
  await page.getByRole('menuitem',{name:'Prepare for an exam…'}).click()
  const setup=page.getByRole('dialog',{name:'Prepare for an exam'})
  await setup.getByLabel('Exam title').fill(title)
  await setup.getByLabel('Exam date and start time').fill(future(-1))
  await setup.getByRole('button',{name:'Save exam'}).click()
 }
 await makePast('First exam')
 let banner=page.getByRole('region',{name:'Exam date passed'})
 await expect(banner).toContainText('Did First exam take place?')
 await banner.getByRole('button',{name:'Not yet'}).click()
 await expect(banner).toHaveCount(0)
 await makePast('Second exam')
 banner=page.getByRole('region',{name:'Exam date passed'})
 await expect(banner).toContainText('Did Second exam take place?')
 await banner.getByRole('button',{name:'Postponed'}).click()
 const postponed=page.getByRole('dialog',{name:'New exam date'})
 await postponed.getByLabel('New date and time').fill(future(3))
 await postponed.getByRole('button',{name:'Save new date'}).click()
 await expect(banner).toHaveCount(0)
 await makePast('Third exam')
 await banner.getByRole('button',{name:'Yes',exact:true}).click()
 await expect(banner).toHaveCount(0)
})

for(const theme of ['light','dark'] as const){
 test('captures the '+theme+' ledger',async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme})
  await page.goto(url('/p/linear-algebra?tab=exam'))
  await expect(page.getByRole('heading',{name:'Coverage ledger'})).toBeVisible()
  const photo=testInfo.outputPath('exam-ledger-'+theme+'.png')
  await page.screenshot({path:photo,fullPage:true})
  await testInfo.attach('Exam ledger · '+theme,{path:photo,contentType:'image/png'})
  if(process.env.CI_JUNIT_DIR){
   const artifacts=join(process.env.CI_JUNIT_DIR,'exam-captures')
   await mkdir(artifacts,{recursive:true})
   await copyFile(photo,join(artifacts,'exam-ledger-'+theme+'.png'))
  }
 })
}

test('keeps the loaded coverage ledger readable offline and disables changes',async({page,context})=>{
 await page.goto(url('/p/linear-algebra?tab=exam'))
 await expect(page.getByRole('heading',{name:'Coverage ledger'})).toBeVisible()
 await context.setOffline(true)
 await expect(page.getByText('Reconnect to change exam prep.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Study',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:/Decide diagonalizability/}).click()
 await expect(page.getByRole('button',{name:'Pin',exact:true})).toBeDisabled()
})
