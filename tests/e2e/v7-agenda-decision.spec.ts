import {expect,test} from '@playwright/test'
import {at} from './v7-scenes'
test('Today reads one decision and reflects a saved Legacy preference',async({page})=>{
  const enabled=(path:string)=>at(path).replace('flags=','flags=atlasAgendaV1,')
  await page.goto(enabled('/'))
  const next=page.getByRole('region',{name:'Next action'})
  await expect(next).toBeVisible()
  await next.getByText('Decision details',{exact:true}).click()
  await expect(next).toContainText('Scheduling algorithm · New')
  await page.goto(enabled('/settings?section=planning'))
  await page.getByRole('button',{name:/Scheduling algorithm/}).click()
  await page.getByRole('radio',{name:/^Legacy/}).click()
  await expect(page.getByRole('button',{name:/Scheduling algorithm/})).toContainText('Legacy')
  await page.goto(enabled('/'))
  await next.getByText('Decision details',{exact:true}).click()
  await expect(next).toContainText('Scheduling algorithm · Legacy')
  await expect(page.getByRole('region',{name:'Study model'}).getByRole('list')).toHaveCount(0)
})
