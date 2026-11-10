module.exports=function measure(){
 const out={};const vw=innerWidth,vh=innerHeight;
 const vis=el=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&Number(cs.opacity)>0.05&&!el.closest('.sr-only,[aria-hidden="true"]')};
 const inView=el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.top<vh};
 out.overflowX=document.documentElement.scrollWidth-vw;
 out.scrollHeight=document.documentElement.scrollHeight;
 const h=document.querySelector('[data-v6-header] h1');out.headerTitle=h?h.innerText.trim():null;
 // dialogs
 out.dialogs=[...document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]')].filter(vis).map(d=>{const r=d.getBoundingClientRect();const cs=getComputedStyle(d);
  const kids=[...d.querySelectorAll('h1,h2,h3,label,p,input,select,textarea,button')].filter(vis);
  const minLeft=kids.length?Math.min(...kids.map(k=>k.getBoundingClientRect().left))-r.left:null;
  const maxRight=kids.length?r.right-Math.max(...kids.map(k=>k.getBoundingClientRect().right)):null;
  return {label:d.getAttribute('aria-label')||(d.querySelector('h2,h1')||{}).innerText||'',left:Math.round(r.left),right:Math.round(vw-r.right),top:Math.round(r.top),bottom:Math.round(vh-r.bottom),w:Math.round(r.width),h:Math.round(r.height),
   margin:cs.margin,padding:cs.padding,contentInsetLeft:minLeft===null?null:Math.round(minLeft),contentInsetRight:maxRight===null?null:Math.round(maxRight),position:cs.position}});
 // small targets in view
 const small=[];document.querySelectorAll('a[href],button,summary,input:not([type=hidden]),select,textarea,[role=button],[role=tab]').forEach(el=>{if(!vis(el)||!inView(el))return;const r=el.getBoundingClientRect();
  if(r.width<44||r.height<44){const inline=el.tagName==='A'&&getComputedStyle(el).display==='inline';small.push({tag:el.tagName.toLowerCase(),label:(el.getAttribute('aria-label')||el.innerText||'').trim().replace(/\s+/g,' ').slice(0,40),w:Math.round(r.width),h:Math.round(r.height),inline})}});
 out.smallTargets=small;
 // text scan
 const texts=[];const tiny=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const t=walker.currentNode;const s=t.textContent.trim();if(!s)continue;const el=t.parentElement;if(!el||!vis(el))continue;texts.push(s);const fs=parseFloat(getComputedStyle(el).fontSize);if(fs<12&&inView(el))tiny.push(s.slice(0,40)+' ('+fs+'px)')}
 const all=texts.join(' \u2016 ');
 const grab=re=>[...new Set((all.match(re)||[]))].slice(0,8);
 out.isoTimestamps=grab(/\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z?/g);
 out.isoDates=grab(/(?<![\dT:])\d{4}-\d\d-\d\d(?!T)/g);
 out.slashDates=grab(/\b\d{1,2}\/\d{1,2}\/\d{4}(,\s*\d{1,2}:\d\d(:\d\d)?\s*(am|pm|AM|PM)?)?/g);
 out.uuids=grab(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g);
 out.rawIds=grab(/\b(project|subject|demo|checkpoint)-[a-z0-9-]+\b/g);
 out.tz=grab(/\b(UTC|Asia\/[A-Za-z]+|GMT[+-]?\d*)\b/g);
 out.tinyText=[...new Set(tiny)].slice(0,12);
 out.text=all.slice(0,1500);
 return out;
};
