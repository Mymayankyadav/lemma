import {t as runtime} from "@lemma/jsx-runtime-DApVmHJR.js";
const jsx=runtime().jsx;
function Rail({value=0,label=`Progress`,className=``}){
  const progress=Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
  return jsx(`div`,{
    role:`progressbar`,"aria-label":label,"aria-valuemin":0,"aria-valuemax":100,
    "aria-valuenow":Math.round(progress*100),className:`notebook-progress-rail ${className}`,
    children:jsx(`span`,{"aria-hidden":true,style:{width:`${progress*100}%`}}),
  });
}
export {Rail as t};
