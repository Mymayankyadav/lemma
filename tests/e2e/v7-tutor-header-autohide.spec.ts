import {expect, test, type Page} from '@playwright/test';

// N227 (Owner: "The header can disappear after few down scroll or inactivity and reappear only after upward scroll
// (make only after scroll speed only) … making more and more chat visible is important without eating the precious space").
const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';

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
  return {chat, header: page.locator('.tutor-header'), back: page.getByRole('button', {name: 'Back', exact: true})};
}

const hidden = (page: Page) => page.locator('main.lemma-tutor[data-header-hidden]');

test('a short scroll down folds the header away for more chat; only a fast scroll up brings it back', async ({page}) => {
  const {chat, back} = await openChat(page);
  await expect(back).toBeVisible();
  const before = (await chat.boundingBox())!.height;
  const box = (await chat.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, 200);
  await expect(hidden(page)).toHaveCount(1);
  await expect(back).not.toBeVisible();
  // The chat takes the room the header gave back.
  await expect.poll(async () => (await chat.boundingBox())!.height).toBeGreaterThan(before + 40);
  // Headless Chromium halves wheel deltas: 200 here is one real notch (deltaY 100).
  // A slow scroll up (single notches apart) leaves it hidden.
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
  await expect(hidden(page)).toHaveCount(1);
  // A fast one (two notches at once) brings it back.
  await page.mouse.wheel(0, -200);
  await page.mouse.wheel(0, -200);
  await expect(hidden(page)).toHaveCount(0);
  await expect(back).toBeVisible();
  // Keys: End folds it, Home brings it back.
  await chat.focus();
  await page.keyboard.press('End');
  await expect(hidden(page)).toHaveCount(1);
  await page.keyboard.press('Home');
  await expect(hidden(page)).toHaveCount(0);
});

test('with a finger, a swipe up folds the header; only a quick fling down brings it back', async ({page}) => {
  const {chat} = await openChat(page);
  const box = (await chat.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const swipe = async (dy: number, steps: number, pause: number) => {
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let step = 1; step <= steps; step++) {
      await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y + dy * step / steps}]});
      if (pause) await page.waitForTimeout(pause);
    }
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  await swipe(-80, 4, 0);
  await expect(hidden(page)).toHaveCount(1);
  // Slowly dragging back down keeps the chat roomy.
  await swipe(120, 8, 120);
  await expect(hidden(page)).toHaveCount(1);
  await swipe(160, 4, 0);
  await expect(hidden(page)).toHaveCount(0);
});

test('the header folds away after a while without input, but never when the chat is too short to scroll', async ({page}) => {
  await page.clock.install();
  const {back} = await openChat(page);
  await expect(back).toBeVisible();
  await page.clock.fastForward(7000);
  await expect(hidden(page)).toHaveCount(1);

  const short = await page.context().newPage();
  await short.clock.install();
  const {back: shortBack, chat} = await openChat(short, false);
  expect(await chat.evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThan(8);
  await short.clock.fastForward(7000);
  await expect(hidden(short)).toHaveCount(0);
  await expect(shortBack).toBeVisible();
});
