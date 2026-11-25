import {expect,test} from '@playwright/test'
import {examPath} from './helpers/exam'
import {liveTutorFixtureResponse,prepareLiveTutor} from './helpers/live-tutor'

test('finds the countdown and short reviews without rating a card',async({page})=>{
 await page.goto(examPath('/'))
 const countdown=page.getByRole('region',{name:'Upcoming exam'})
 await expect(countdown).toContainText('Linear Algebra midterm')
 await expect(countdown).toContainText('marks independently covered')
 await expect(countdown.getByRole('link',{name:'Ledger'})).toBeVisible()
 await page.goto(examPath('/practice'))
 const topics=page.getByRole('region',{name:'Short topic reviews for Linear Algebra midterm'})
 await expect(topics).toBeVisible()
 await topics.getByRole('link',{name:'Read a recap'}).first().click()
 await expect(page).toHaveURL(/exam=demo-exam-project-linear/)
 await expect(page.getByRole('textbox',{name:'Your answer'})).toHaveValue(/record reading exposure/)
})

test('keeps a changed demo sitting after reload and opens its linked calendar deadline',async({page})=>{
 await page.goto(examPath('/p/real-analysis'))
 await page.getByRole('button',{name:'More path actions'}).click()
 await page.getByRole('menuitem',{name:'Prepare for an exam…'}).click()
 const setup=page.getByRole('dialog',{name:'Prepare for an exam'})
 const date=new Date(Date.now()+86400000).toISOString().slice(0,16)
 await setup.getByLabel('Exam title').fill('A calendar-linked exam')
 await setup.getByLabel('Exam date and start time').fill(date)
 await setup.getByRole('button',{name:'Save exam'}).click()
 await expect(page.getByRole('heading',{name:'A calendar-linked exam'})).toBeVisible()
 await page.reload()
 await expect(page.getByRole('heading',{name:'A calendar-linked exam'})).toBeVisible()
 await page.goto(examPath('/calendar?date='+date.slice(0,10)))
 await page.getByRole('button',{name:/View \d+ due items?/}).click()
 await expect(page.getByRole('dialog',{name:'Deadlines and practice'}).getByRole('listitem').filter({hasText:'A calendar-linked exam'})).toContainText('Exam · Real Analysis')
})

test('two independently signed-in browsers draft one exam proposal',async({browser,baseURL})=>{
 const contexts=await Promise.all([browser.newContext({baseURL}),browser.newContext({baseURL})])
 try{
  const pages=await Promise.all(contexts.map(context=>context.newPage()))
  const ideaId='76767676-7676-4676-8676-767676767676'
  const proposalId='78787878-7878-4878-8878-787878787878'
  const target='Explain the converse of an implication'
  const stamped:string[]=[]
  let arrivals=0,proposals=0
  let unblock!:()=>void
  const paired=new Promise<void>(resolve=>{unblock=resolve})
  let idea={id:ideaId,project_id:'',sitting_id:null,target,reason:'Useful retrieval target',status:'saved',sightings:1,
   version:1,proposal_id:null as string|null,proposals:null as {status:string}|null}
  await Promise.all(pages.map(async page=>{
   const fixture=await prepareLiveTutor(page)
   idea.project_id=fixture.projectId
   await page.route('**/rest/v1/**',async route=>{
    const request=route.request(),table=new URL(request.url()).pathname.split('/rest/v1/')[1]
    if(table==='card_ideas')return route.fulfill({json:[idea]})
    if(table==='rpc/exam_home_summary')return route.fulfill({json:fixture.payload['rpc/home_summary']})
    if(table==='rpc/card_idea_command'){
     const {p}=request.postDataJSON() as {p:{operationId:string;expectedVersion:number;operation:string;target:{id:string}}}
     expect(p).toMatchObject({operation:'draft',target:{id:ideaId},expectedVersion:1})
     stamped.push(p.operationId)
     if(++arrivals===2)unblock()
     await paired
     if(p.expectedVersion!==idea.version)
      return route.fulfill({json:{operationId:p.operationId,status:'conflict',conflict:{currentVersion:idea.version}}})
     proposals++
     idea={...idea,version:2,status:'drafted',proposal_id:proposalId,proposals:{status:'pending'}}
     return route.fulfill({json:{operationId:p.operationId,status:'ok',id:ideaId,version:2,actionNo:1}})
    }
    return route.fulfill({json:liveTutorFixtureResponse(fixture.payload,table,request.headers().accept)})
   })
   await page.goto('/lemma/?demo=0&flags=v7Shell,v6Shell,examMode#/p/logic?tab=cards&cards=ideas')
   const ideas=page.getByRole('region',{name:'Card ideas'})
   await expect(ideas.getByRole('heading',{name:target})).toBeVisible()
   await ideas.getByRole('button',{name:'Draft',exact:true}).click()
  }))
  await Promise.all(pages.map(page=>page.getByRole('button',{name:'Send to Inbox'}).click()))
  await Promise.all(pages.map(page=>expect(page.getByRole('link',{name:'Waiting in Inbox'})).toHaveAttribute('href','#/proposals?card='+proposalId)))
  expect(new Set(stamped).size).toBe(2)
  expect(proposals).toBe(1)
 }finally{await Promise.all(contexts.map(context=>context.close()))}
})
