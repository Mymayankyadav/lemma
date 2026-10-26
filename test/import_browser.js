'use strict';
module.exports = async ({browser,newPage,ok}) => {
  const {ctx,page}=await newPage(browser,{mock:false,label:'import',editorHooks:true});
  try {
    await page.waitForSelector('.onboard');
    await page.evaluate(()=>__editor.ImportSheet.open());
    const source=JSON.stringify([
      {front:'Import first',back:'answer',title:'First import'},
      {front:'Import abort',back:'answer',requires:['First import']}
    ]);
    await page.fill('#imp-text',source);
    await page.waitForFunction(()=>!document.querySelector('.sheet-foot .btn-primary').disabled);
    await page.evaluate(()=>{
      const add=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(value,...args) {
        const request=add.call(this,value,...args);
        if(value.front==='Import abort') request.addEventListener('success',()=>this.transaction.abort());
        return request;
      };
    });
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(()=>document.querySelector('.imp-summary')?.textContent.includes('Import stopped'));
    const ids=await page.evaluate(()=>JSON.parse(localStorage.getItem('lemma.import.v1')).job.items.map(x=>x.note.id));
    ok(await page.inputValue('#imp-text')===source && await page.evaluate(()=>__editor.Model.notes.size===1),
      'partial import failure retains source and projects only the committed card');
    await page.evaluate(async id=>{
      const note=__editor.Model.notes.get(id);
      note.cards[1].reps=8; note.log.push([Date.now(),1,3,0,200,0]);
      await __editor.Store.saveNote(note);
    },ids[0]);
    await page.reload();
    await page.waitForSelector('.today');
    await page.evaluate(()=>__editor.ImportSheet.open());
    await page.waitForFunction(()=>!document.querySelector('.sheet-foot .btn-primary').disabled);
    ok(await page.inputValue('#imp-text')===source,'import source and stable job survive browser reload');
    await page.click('.sheet-foot .btn-primary');
    await page.waitForSelector('#imp-text',{state:'hidden'});
    ok(await page.evaluate(ids=>__editor.Model.notes.size===2 &&
      ids.every(id=>__editor.Model.notes.has(id)) && __editor.Model.notes.get(ids[0]).cards[1].reps===8 &&
      __editor.Model.notes.get(ids[1]).requires[0]===ids[0] && localStorage.getItem('lemma.import.v1')===null,ids),
      'retry uses the original IDs, keeps later reviews and commits prerequisite links');
  } finally {await ctx.close();}
};
