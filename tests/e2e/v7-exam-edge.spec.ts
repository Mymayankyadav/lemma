import {expect,test} from '@playwright/test'
import {examPath} from './helpers/exam'

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
