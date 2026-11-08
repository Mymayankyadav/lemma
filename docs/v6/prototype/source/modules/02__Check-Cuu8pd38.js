import{a as e}from"@lemma/rolldown-runtime-BWaJ3C7D.js";import{n as t,t as n}from"@lemma/jsx-runtime-DApVmHJR.js";import{n as r,r as i}from"@lemma/createLucideIcon-C9eAT1Le.js";import{t as a}from"@lemma/check-BXZ7pTLx.js";import{t as o}from"@lemma/minus-Bd90Uwh2.js";import{o as s}from"@lemma/motion-DL_I35iP.js";var c=n();function l({icon:e,label:t,size:n=76,halo:a=!0,className:o=``,...l}){let u=s(),d=!!i()||u;return(0,c.jsxs)(`span`,{className:`relative inline-flex items-center justify-center`,style:{width:n,height:n},children:[a&&!d&&(0,c.jsx)(r.span,{"aria-hidden":`true`,className:`pointer-events-none absolute inset-0 rounded-full border-[1.5px] border-amber-line-2`,animate:{scale:[1,1.5],opacity:[.6,0]},transition:{repeat:1/0,duration:2.8,ease:`easeOut`}}),(0,c.jsx)(r.button,{...l,"aria-label":t,whileTap:d?void 0:{scale:.94},className:`orb relative flex items-center justify-center ${o}`,style:{width:n,height:n},children:(0,c.jsx)(e,{size:n===64?24:28,strokeWidth:2,"aria-hidden":`true`})})]})}var u=e(t(),1);function d({checked:e,onChange:t,label:n,disabled:r}){let i=(0,u.useId)();return(0,c.jsxs)(`label`,{htmlFor:i,className:`flex min-h-11 cursor-pointer items-center justify-between gap-3 text-body-l text-ink`,children:[(0,c.jsx)(`span`,{children:n}),(0,c.jsx)(`span`,{"aria-hidden":true,"data-ui":"switch-value",children:e?"On":"Off"}),(0,c.jsxs)(`span`,{"data-checked":e,className:`ui-switch-track`,children:[(0,c.jsx)(`input`,{id:i,type:`checkbox`,role:`switch`,className:`peer sr-only`,checked:e,onChange:e=>t(e.currentTarget.checked),disabled:r}),(0,c.jsx)(`span`,{"aria-hidden":`true`,className:`ui-switch-thumb`})]})]})}function f({checked:e,onChange:t,size:n=22,label:r,disabled:i,labelVisibility:v=`visible`}){
 let s=(0,u.useRef)(null),h=(0,u.useId)();
 (0,u.useEffect)(()=>{if(s.current)s.current.indeterminate=e===`mixed`},[e]);
 let hidden=v===`visually-hidden`;
 return(0,c.jsxs)(`label`,{
  "data-ui":`review-checkbox`,"data-state":e===`mixed`?`mixed`:e?`checked`:`unchecked`,
  className:`relative inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 text-label text-ink-2 ${hidden?`justify-center`:``}`,
  children:[
   (0,c.jsx)(`input`,{ref:s,id:h,type:`checkbox`,disabled:i,checked:e===!0,
    className:`peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed`,
    onChange:e=>t(e.currentTarget.checked)}),
   (0,c.jsx)(`span`,{"aria-hidden":`true`,
    className:`pointer-events-none relative flex shrink-0 items-center justify-center rounded-[3px] border border-edge-3 bg-well peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber ${e?`border-amber bg-amber text-amber-ink`:``}`,
    style:{width:n,height:n},children:e===`mixed`?(0,c.jsx)(o,{size:14}):e?(0,c.jsx)(a,{size:15,strokeWidth:2.6}):null}),
   (0,c.jsx)(`span`,{className:hidden?`sr-only`:`min-w-0`,children:r})
  ]
 });
}export{d as n,l as r,f as t};