// A complete Tab cycle, including trapped dialogs and controls below the initial viewport.
export async function focusCycle(page) {
  const seen=new Set(),rows=[];
  for(;;){
    await page.keyboard.press('Tab');
    const stop=await page.evaluate(()=>{
      const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();
      const path=[];for(let node=e;node?.parentElement;node=node.parentElement)path.unshift([...node.parentElement.children].indexOf(node));
      return {path:path.join('/'),el:e.localName,name:(e.getAttribute('aria-label')||e.innerText||'').slice(0,60),
        ring:s.outlineStyle==='none'?null:s.outlineWidth+' '+s.outlineColor,gap:s.outlineOffset,
        shadow:s.boxShadow==='none'?null:s.boxShadow,visible:r.width>0&&r.bottom>0&&r.top<innerHeight};
    });
    if(seen.has(stop.path))break;
    seen.add(stop.path);if(stop.el!=='body')rows.push(stop);
  }
  return rows;
}
