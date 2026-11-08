import {t as runtime} from "@lemma/jsx-runtime-DApVmHJR.js";
const jsx=runtime().jsx;
function ProgressRail({total=0,done=0,label=`Checkpoint progress`,tone=`accent`}){
  const maximum=Math.max(0,Math.floor(Number(total)||0));
  const completed=Math.min(maximum,Math.max(0,Math.floor(Number(done)||0)));
  return jsx(`div`,{
    role:`progressbar`,"aria-label":label,"aria-valuemin":0,
    "aria-valuemax":maximum||1,"aria-valuenow":completed,
    "aria-valuetext":`${completed.toLocaleString()} of ${maximum.toLocaleString()}`,
    className:`notebook-progress-rail`,
    children:jsx(`span`,{"aria-hidden":true,style:{width:`${maximum?completed/maximum*100:0}%`,background:tone===`green`?`var(--early)`:`var(--accent)`}}),
  });
}
export {ProgressRail as t};
