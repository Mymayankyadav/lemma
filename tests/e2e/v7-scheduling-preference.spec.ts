import {expect, test} from '@playwright/test'
import {at} from './v7-scenes'

test('Planning offers New by default, saves Legacy, and can undo the change', async ({page}) => {
  const planning = at('/settings?section=planning')
  await page.goto(planning)
  await expect(page.getByRole('heading', {name: 'Planning', exact: true})).toBeVisible()
  await expect(page.getByRole('button', {name: /Scheduling algorithm/})).toHaveCount(0)

  await page.goto(planning.replace('flags=', 'flags=atlasAgendaV1,'))
  const choice = page.getByRole('button', {name: /Scheduling algorithm/})
  await expect(choice).toContainText('New')
  await choice.click()
  await expect(page.getByRole('radio', {name: /^New/})).toBeChecked()
  await page.getByRole('radio', {name: /^Legacy/}).click()
  await expect(choice).toContainText('Legacy')
  await page.getByRole('button', {name: 'Undo', exact: true}).click()
  await expect(choice).toContainText('New')
})
