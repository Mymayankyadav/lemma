import {expect,test} from '@playwright/test';

for (const [width, height, textSize] of [[320, 640, 100], [320, 640, 160], [390, 844, 160], [844, 390, 100]]) {
  test(`Tutor keyboard keeps symbols reachable at ${width}px and ${textSize}% text`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.addInitScript(size => {
      document.addEventListener('DOMContentLoaded', () => {document.documentElement.style.fontSize = size + '%';});
    }, textSize);
    await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
    await page.getByRole('button',{name:'Write a question',exact:true}).click();
    const answer = page.getByRole('textbox',{name:'Your answer',exact:true});
    await answer.focus();
    await page.keyboard.type('teh ');
    const keyboard = page.getByRole('group',{name:'Answer keyboard',exact:true});
    const choices = keyboard.getByRole('group',{name:'Word suggestions',exact:true}).getByRole('button');
    await expect(choices).toHaveCount(3);
    const correction = page.getByRole('button',{name:'Replace teh with the',exact:true});
    await expect(correction).toBeVisible();
    await expect(answer).toHaveJSProperty('textContent', 'teh ');
    await expect(keyboard.getByRole('button',{name:'Use device keyboard',exact:true})).toHaveCount(0);
    await correction.click();
    await expect(answer).toHaveJSProperty("textContent", 'the ');
    await keyboard.getByRole('button',{name:'Maths symbols',exact:true}).click();
    await keyboard.getByRole('group',{name:'Quick math symbols'}).getByRole('button',{name:'∈',exact:true}).click();
    await keyboard.getByRole('button',{name:'ABC',exact:true}).click();
    await expect(answer).toHaveJSProperty("textContent", 'the ∈');

    const q = keyboard.getByRole('button',{name:'q',exact:true});
    const qBox = (await q.boundingBox())!;
    // Inspect a press without the assertions themselves turning it into a hold.
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10000));
    // Tap the outer part of the cell, beyond the inset visual keycap.
    await page.mouse.move(qBox.x + 1, qBox.y + qBox.height / 2);
    await page.mouse.down();
    const preview = keyboard.locator('.tutor-key-preview');
    await expect(preview).toHaveText('q');
    await expect(preview).toBeInViewport({ratio:1});
    const previewBox = (await preview.boundingBox())!;
    expect(previewBox.width).toBeGreaterThan(qBox.width);
    await page.mouse.up();
    await expect(preview).toBeHidden();
    await expect(answer).toHaveJSProperty("textContent", 'the ∈q');

    await keyboard.getByRole('button',{name:'Maths symbols',exact:true}).click();
    await expect(answer).toBeFocused();
    const categories = keyboard.getByRole('group',{name:'Math categories'});
    const header = page.locator('.tutor-header');
    for (const [category, finalKey] of [['Greek','Ω'], ['Analysis','·'], ['Phrases','Take … ∈ …']]) {
      await categories.getByRole('button',{name:category,exact:true}).click();
      const grid = keyboard.getByRole('group',{name:category + ' keys',exact:true});
      const overflow = await grid.evaluate(node => ({
        x:node.scrollWidth-node.clientWidth, y:node.scrollHeight-node.clientHeight,
        mode:getComputedStyle(node).overflowY,
      }));
      expect(overflow).toEqual({x:0,y:0,mode:'visible'});
      await expect(header).toBeInViewport({ratio:1});
      expect(await page.locator('.lemma-tutor').evaluate(node=>node.scrollTop)).toBe(0);
      await expect(answer).toBeInViewport({ratio:1});
      await expect(keyboard).toBeInViewport({ratio:1});
      const [headerBox,keyboardBox] = await Promise.all([header.boundingBox(),keyboard.boundingBox()]);
      expect(keyboardBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
      if (width > height) {
        const chat = page.getByRole('log', {name:'Conversation'});
        await expect(chat).toBeInViewport({ratio:1});
        const chatBox = (await chat.boundingBox())!;
        expect(chatBox.height).toBeGreaterThan(height/2);
        expect(chatBox.x+chatBox.width).toBeLessThanOrEqual(keyboardBox!.x);
      }
      expect(keyboardBox!.y + keyboardBox!.height).toBeLessThanOrEqual(height);
      await expect(grid.getByRole('button',{name:finalKey,exact:true})).toBeInViewport({ratio:1});
    }
    await keyboard.getByRole('button',{name:'Next phrase page',exact:true}).click();
    const phrase = keyboard.getByRole('button',{name:'Why?',exact:true});
    await expect(phrase).toBeInViewport({ratio:1});
    await expect(header).toBeInViewport({ratio:1});
    await phrase.click();
    await expect(answer).toHaveJSProperty("textContent", 'the ∈qWhy does □?');
    const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(docOverflow).toBeLessThanOrEqual(1);
  });
}
