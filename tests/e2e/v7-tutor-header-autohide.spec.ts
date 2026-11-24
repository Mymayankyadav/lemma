import {expect, test, type Page} from '@playwright/test';

const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
const hideHeader = (page: Page) => page.getByRole('button', {name: 'Hide header', exact: true});
const showHeader = (page: Page) => page.getByRole('button', {name: 'Show header', exact: true});

async function openChat(page: Page, tall = true) {
  await page.setViewportSize({width: 393, height: 873});
  await page.goto(url);
  await page.getByRole('button', {name: 'Write a question'}).click();
  const chat = page.getByRole('log', {name: 'Conversation'});
  if (tall) await chat.evaluate(node => {
    const room = document.createElement('div');
    room.style.height = '2400px';
    room.style.flex = 'none';
    node.prepend(room);
    node.scrollTop = node.scrollHeight;
  });
  return {chat, back: page.getByRole('button', {name: 'Back', exact: true})};
}

test('the composer eye hides and restores the header while keeping the chat below the system bar', async ({page}) => {
  const {chat, back} = await openChat(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '36px'));
  await expect(back).toBeVisible();
  const before = (await chat.boundingBox())!.height;
  await hideHeader(page).click();
  await expect(back).not.toBeVisible();
  await expect(page.getByRole('button', {name: 'Session actions'})).not.toBeVisible();
  await expect.poll(async () => (await chat.boundingBox())!.height).toBeGreaterThan(before + 40);
  expect((await chat.boundingBox())!.y).toBeGreaterThanOrEqual(36);
  await expect(showHeader(page)).toBeVisible();
  await showHeader(page).click();
  await expect(back).toBeVisible();
});

test('wheel, touch and navigation keys leave header visibility in the learner’s control', async ({page}) => {
  const {chat, back} = await openChat(page);
  const box = (await chat.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, 300);
  await chat.evaluate(node => {node.tabIndex = 0; node.focus();});
  await page.keyboard.press('End');
  await expect(back).toBeVisible();

  await hideHeader(page).click();
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y + 160}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await chat.focus();
  await page.keyboard.press('Home');
  await expect(back).not.toBeVisible();
  await showHeader(page).click();
  await expect(back).toBeVisible();
});

test('idle chat keeps the header visible and a short chat can still hide it', async ({page}) => {
  await page.clock.install();
  const {back} = await openChat(page);
  await page.clock.fastForward(7000);
  await expect(back).toBeVisible();

  const short = await page.context().newPage();
  const {back: shortBack, chat} = await openChat(short, false);
  expect(await chat.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThan(8);
  await hideHeader(short).click();
  await expect(shortBack).not.toBeVisible();
  await showHeader(short).click();
  await expect(shortBack).toBeVisible();
});
