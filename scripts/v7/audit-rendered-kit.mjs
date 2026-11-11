// Run by the screenshot workflow only. Verify the rendered cascade, not just token values.
import assert from 'node:assert/strict';
export async function auditRenderedKit(page) {
  const report=[];
  for(const theme of ['graph','graph-night']){
    const panel=page.getByRole('region',{name:'Components and states',exact:true}).locator(`.v7-split-panel[data-theme="${theme}"]`);
    const primary=panel.locator('.v7-action-primary').first();
    const inspect=async(locator,token)=>locator.evaluate((element,role)=>{
      const css=getComputedStyle(element),sample=document.createElement('span');
      sample.style.color=`var(${role})`;element.append(sample);const expected=getComputedStyle(sample).color;sample.remove();
      return {background:css.backgroundColor,image:css.backgroundImage,color:css.color,border:css.borderTopColor,borderWidth:css.borderTopWidth,weight:css.fontWeight,expected};
    },token);
    await primary.hover();await page.waitForTimeout(180);
    let actual=await inspect(primary,'--v7-role-action-hover');
    assert.equal(actual.background,actual.expected,theme+' primary hover must use its own token');assert.equal(actual.image,'none');
    await page.mouse.down();await page.waitForTimeout(180);
    actual=await inspect(primary,'--v7-role-action-pressed');
    assert.equal(actual.background,actual.expected,theme+' primary press must use its own token');assert.equal(actual.image,'none');
    const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
    const a=luminance(actual.color),b=luminance(actual.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.ok(ratio>=4.5,theme+' pressed primary text contrast '+ratio);
    await page.mouse.up();await page.waitForTimeout(1900);
    const thumb=panel.locator('.v7-segmented [aria-checked="true"]').first();
    actual=await inspect(thumb,'--v7-role-border-default');assert.equal(actual.border,actual.expected);assert.equal(actual.borderWidth,'1px');assert.ok(Number(actual.weight)>=700);
    const tab=panel.locator('.v7-tabs [aria-selected="false"]').first();await tab.hover();
    actual=await inspect(tab,'--v7-role-text-secondary');assert.equal(actual.color,actual.expected,theme+' tab hover text');
    const select=panel.locator('.v7-matrix details').filter({has:page.locator('summary').filter({hasText:/^Select$/})});await select.evaluate(el=>{el.open=true;});
    const disabled=select.locator('button.v7-picker:disabled');actual=await inspect(disabled,'--v7-role-border-subtle');
    assert.equal(await disabled.getAttribute('type'),'button');assert.equal(actual.background,'rgba(0, 0, 0, 0)');assert.equal(actual.border,actual.expected);
    await select.evaluate(el=>{el.open=false;});
    const patterns=page.getByRole('region',{name:'Patterns',exact:true}).locator(`.v7-split-panel[data-theme="${theme}"]`);
    assert.equal(await patterns.locator('.v7-mastery-track .v7-mastery-end').count(),0);
    assert.equal(await patterns.locator('.v7-mastery-complete .v7-mastery-end').count(),1);
    const chart=page.getByRole('region',{name:'Data visualisation',exact:true}).locator(`.v7-split-panel[data-theme="${theme}"]`);
    const cell=await chart.locator('.v7-heatmap button').first().boundingBox();assert.ok(cell&&Math.abs(cell.width-cell.height)<1,'Heatmap cells must be square');
    assert.equal(await chart.locator('.v7-heatmap-weeks > span').count(),14);
    assert.equal(await chart.locator('.v7-heatmap [aria-current="date"]').count(),1);
    report.push({theme,pressedContrast:ratio,buttonStates:'pass',segment:'pass',tabHover:'pass',disabledSelect:'pass',completionMarker:'pass',heatmap:'pass'});
  }
  assert.equal(await page.locator('.v7-kit-header [role="radiogroup"][aria-label="Theme"]').count(),1);
  assert.equal(await page.locator('.v7-kit-header [role="tablist"]').count(),0);
  const steps=page.getByRole('region',{name:'Components and states',exact:true}).locator('.v7-split-panel').first().getByRole('group',{name:'Daily sessions',exact:true});
  await steps.getByRole('button',{name:'Increase Daily sessions',exact:true}).focus();await page.keyboard.press('ArrowUp');assert.equal((await steps.locator('output').textContent()).trim(),'4');await page.keyboard.press('ArrowDown');
  return report;
}
