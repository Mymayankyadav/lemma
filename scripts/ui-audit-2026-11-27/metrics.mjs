// In-page design measurements. Serialised into the page via page.evaluate(measure, opts).
export function measure(opts){
 const W=innerWidth,H=innerHeight;
 const cv=document.createElement('canvas');cv.width=cv.height=1;const cx=cv.getContext('2d',{willReadFrequently:true});
 const cache=new Map();
 function rgba(str){
  if(cache.has(str))return cache.get(str);
  cx.clearRect(0,0,1,1);cx.fillStyle='#000';cx.fillStyle=str;cx.fillRect(0,0,1,1);
  // fillRect with alpha composites on transparent: recover straight alpha
  const d=cx.getImageData(0,0,1,1).data;const a=d[3]/255;
  const out=a===0?[0,0,0,0]:[d[0]*255/d[3],d[1]*255/d[3],d[2]*255/d[3],a].map((v,i)=>i<3?Math.min(255,Math.round(v)):v);
  cache.set(str,out);return out;
 }
 const over=(f,b)=>{const a=f[3];return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a),1]};
 const lin=c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4};
 const lum=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
 const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)};
 const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
 const root=document.documentElement;
 const pageBg=(()=>{const b=rgba(getComputedStyle(document.body).backgroundColor);const h=rgba(getComputedStyle(root).backgroundColor);
  return b[3]===1?b:h[3]===1?h:over(b[3]?b:h,[0,0,0,1]);})();
 const vis=e=>{const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;if(e.closest('.v7-sr-only,[class*=sr-only]'))return false;const s=getComputedStyle(e);if(s.clip&&/rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip))return false;
  if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;
  return r.bottom>0&&r.right>0&&r.top<H&&r.left<W;};
 const sel=e=>{let s=e.tagName.toLowerCase();if(e.id)s+='#'+e.id;const c=[...e.classList].filter(x=>!/^(css|_)/.test(x)).slice(0,2).join('.');if(c)s+='.'+c;
  const r=e.getAttribute('role');if(r)s+='[role='+r+']';return s;};
 const label=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,40);
 function opacityChain(e){let o=1;for(let n=e;n&&n.nodeType===1;n=n.parentElement){o*=+getComputedStyle(n).opacity;}return o;}
 function effBg(e){ // composite ancestors' backgrounds under e (ignores images/gradients, reports them)
  const chain=[];let complex=false;
  for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);const c=rgba(s.backgroundColor);
   if(c[3]>0)chain.push(c);if(s.backgroundImage!=='none'&&!/^(none)$/.test(s.backgroundImage))complex=complex||/url|image|radial|conic/.test(s.backgroundImage);
   if(c[3]===1)break;}
  let base=pageBg;for(let i=chain.length-1;i>=0;i--)base=over(chain[i],base);return {c:base,complex};
 }
 const out={viewport:[W,H],doc:[root.scrollWidth,root.scrollHeight]};
 const all=[...document.querySelectorAll('body *')].filter(vis);
 // ---- focus
 const ae=document.activeElement;
 if(ae&&ae!==document.body){const s=getComputedStyle(ae);const fv=ae.matches(':focus-visible');
  out.focus={el:sel(ae),text:label(ae),focusVisible:fv,outline:s.outlineStyle==='none'?null:s.outlineWidth+' '+s.outlineStyle+' '+s.outlineColor,
   boxShadow:s.boxShadow==='none'?null:s.boxShadow.slice(0,80),rect:(r=>[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)])(ae.getBoundingClientRect()),tabindex:ae.getAttribute('tabindex')};}
 // ---- horizontal overflow
 out.overflowX=root.scrollWidth>W+1;
 if(out.overflowX)out.overflowOffenders=all.filter(e=>e.getBoundingClientRect().right>W+2).slice(0,6).map(e=>sel(e)+' → '+Math.round(e.getBoundingClientRect().right)+'px');
 // ---- text + contrast
 const texts=[];const fgs=new Map();
 for(const e of all){
  const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>0);if(!own)continue;
  const s=getComputedStyle(e);const fs=parseFloat(s.fontSize);const fw=+s.fontWeight;
  let fg=rgba(s.color);fg[3]*=opacityChain(e);
  const {c:bg,complex}=effBg(e);const f=over(fg,bg);const r=ratio(f,bg);
  const large=fs>=24||(fs>=18.66&&fw>=700);
  if(r<1.05&&!complex)continue; // same colour as its surface: decorative/hidden, not a legibility failure
  const t={sel:sel(e),text:label(e),fs,fw,ratio:+r.toFixed(2),fg:hex(f),bg:hex(bg),large,complex};
  texts.push(t);const k=hex(f)+'|'+hex(bg);const o=fgs.get(k)||{fg:hex(f),bg:hex(bg),ratio:+r.toFixed(2),n:0,sample:t.text};o.n++;fgs.set(k,o);
 }
 out.text={count:texts.length,
  fail:texts.filter(t=>t.ratio<(t.large?3:4.5)).length,
  failAAA:texts.filter(t=>t.ratio<7).length,
  minRatio:texts.length?Math.min(...texts.map(t=>t.ratio)):null,
  median:texts.length?texts.map(t=>t.ratio).sort((a,b)=>a-b)[Math.floor(texts.length/2)]:null,
  worst:texts.filter(t=>t.ratio<(t.large?3:4.5)).sort((a,b)=>a.ratio-b.ratio).slice(0,8),
  palette:[...fgs.values()].sort((a,b)=>b.n-a.n).slice(0,10),
  tiny:texts.filter(t=>t.fs<12).length,tinySamples:texts.filter(t=>t.fs<12).slice(0,5).map(t=>`${t.fs}px “${t.text}”`),
  sizes:[...new Set(texts.map(t=>t.fs))].sort((a,b)=>a-b)};
 // ---- layer separation (surface vs parent, border vs surface)
 const layers=[];
 for(const e of all){
  const s=getComputedStyle(e);const r=e.getBoundingClientRect();if(r.width<120||r.height<36||r.width>W*1.05)continue;
  const bgc=rgba(s.backgroundColor);const bw=parseFloat(s.borderTopWidth)||0,bc=rgba(s.borderTopColor);
  const hasBorder=bw>0&&s.borderTopStyle!=='none'&&bc[3]>0;if(bgc[3]<0.05&&!hasBorder)continue;
  const par=effBg(e.parentElement).c;const self=bgc[3]>0?over(bgc,par):par;
  layers.push({sel:sel(e),w:Math.round(r.width),h:Math.round(r.height),surface:hex(self),parent:hex(par),
   surfaceRatio:+ratio(self,par).toFixed(2),border:hasBorder?hex(over(bc,self)):null,borderRatio:hasBorder?+ratio(over(bc,self),self).toFixed(2):null,
   shadow:s.boxShadow==='none'?null:s.boxShadow.slice(0,60),radius:s.borderTopLeftRadius});
 }
 const weak=layers.filter(l=>l.surfaceRatio<1.12&&(l.borderRatio===null||l.borderRatio<1.5));
 out.layers={count:layers.length,weakSeparation:weak.length,
  medianSurface:layers.length?layers.map(l=>l.surfaceRatio).sort((a,b)=>a-b)[Math.floor(layers.length/2)]:null,
  medianBorder:(b=>b.length?b[Math.floor(b.length/2)]:null)(layers.filter(l=>l.borderRatio!==null).map(l=>l.borderRatio).sort((a,b)=>a-b)),
  samples:layers.slice(0,6)};
 out.pageBg=hex(pageBg);
 // ---- targets
 const ctl=all.filter(e=>e.matches('button,a[href],[role=tab],[role=radio],[role=switch],[role=checkbox],[role=button],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
  .filter(e=>{const r=e.getBoundingClientRect();return r.top<H&&r.bottom>0&&r.left<W&&r.right>0;});
 const small=[];
 for(const e of ctl){let r=e.getBoundingClientRect();
  // inputs wrapped by labels: use label box
  if(e.matches('input[type=checkbox],input[type=radio]')&&e.closest('label'))r=e.closest('label').getBoundingClientRect();
  const m=Math.min(r.width,r.height);if(m<44&&!(e.tagName==='A'&&getComputedStyle(e).display==='inline'&&e.closest('p,li,span')))small.push({sel:sel(e),text:label(e),w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)});}
 out.targets={count:ctl.length,under44:small.length,under32:small.filter(s=>Math.min(s.w,s.h)<32).length,samples:small.sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h)).slice(0,8)};
 // ---- clipped text
 out.clipped=all.filter(e=>{const s=getComputedStyle(e);return (s.textOverflow==='ellipsis'||s.overflow==='hidden')&&e.scrollWidth>e.clientWidth+2&&e.textContent.trim().length>0&&e.children.length<3;})
  .slice(0,8).map(e=>`${sel(e)} “${label(e)}” ${e.scrollWidth}>${e.clientWidth}`);
 // ---- pink / accent borders & rings
 const pinkish=c=>c[3]>0.2&&c[0]>150&&c[0]>c[1]+45&&c[2]>c[1]+10;
 const pinks=[];
 for(const e of all){const s=getComputedStyle(e);
  const b=rgba(s.borderTopColor),bw=parseFloat(s.borderTopWidth);
  if(bw>0&&s.borderTopStyle!=='none'&&pinkish(b))pinks.push({kind:'border',sel:sel(e),text:label(e)});
  const o=rgba(s.outlineColor);if(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0&&pinkish(o))pinks.push({kind:'outline',sel:sel(e),text:label(e)});}
 out.pinkEdges=pinks.slice(0,8);out.pinkEdgeCount=pinks.length;
 // ---- alignment: near-miss left/right edges of wide blocks
 const edges=[];
 for(const e of all){const r=e.getBoundingClientRect();if(r.width<W*0.35||r.width>W-1||r.height<20||r.top>H)continue;
  const s=getComputedStyle(e);if(e.children.length===0&&!e.textContent.trim())continue;
  if(!(s.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(s.borderTopWidth)>0||/^(H1|H2|H3|HEADER|NAV|SECTION|ARTICLE|LI)$/.test(e.tagName)||e.matches('[class*=card],[class*=sheet],[class*=bar],[class*=row]')))continue;
  edges.push({sel:sel(e),l:+r.left.toFixed(1),r:+r.right.toFixed(1)});}
 const near=[];
 const ls=[...new Set(edges.map(e=>Math.round(e.l)))].sort((a,b)=>a-b);
 for(let i=1;i<ls.length;i++)if(ls[i]-ls[i-1]>=1&&ls[i]-ls[i-1]<=8)near.push(`left ${ls[i-1]}px ↔ ${ls[i]}px`);
 const rs=[...new Set(edges.map(e=>Math.round(e.r)))].sort((a,b)=>a-b);
 for(let i=1;i<rs.length;i++)if(rs[i]-rs[i-1]>=1&&rs[i]-rs[i-1]<=8)near.push(`right ${rs[i-1]}px ↔ ${rs[i]}px`);
 out.alignment={leftEdges:ls.slice(0,10),rightEdges:rs.slice(-10),nearMisses:near.slice(0,8),
  bySel:Object.fromEntries(ls.slice(0,6).map(l=>[l,[...new Set(edges.filter(e=>Math.round(e.l)===l).map(e=>e.sel))].slice(0,4)]))};
 // ---- fixed bars
 out.fixed=all.filter(e=>getComputedStyle(e).position==='fixed'&&e.getBoundingClientRect().width>W*0.2||getComputedStyle(e).position==='sticky').slice(0,6).map(e=>{const r=e.getBoundingClientRect();
  const s=getComputedStyle(e);return {sel:sel(e),pos:s.position,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],bg:s.backgroundColor.slice(0,40),blur:s.backdropFilter&&s.backdropFilter!=='none'?s.backdropFilter:null};});
 // ---- type / radius / shadow sprawl
 const radii=new Map(),shadows=new Set();
 for(const e of all){const s=getComputedStyle(e);const r=s.borderTopLeftRadius;if(r&&r!=='0px')radii.set(r,(radii.get(r)||0)+1);if(s.boxShadow!=='none')shadows.add(s.boxShadow.slice(0,70));}
 out.radii=[...radii.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);out.shadowCount=shadows.size;
 out.fonts=[...new Set(all.map(e=>getComputedStyle(e).fontFamily.split(',')[0].trim()))].slice(0,6);
 // ---- headings
 out.h1=document.querySelector('h1')?.textContent?.trim().slice(0,60)??null;
 out.title=document.title;
 return out;
}
