/** PLAN §6.11: the editor's key row — the owner's own KaTeX macros first, then common symbols. Pure for testing. */
export interface EditorKey{label:string;name:string;insert:string}
export const symbolKeys:readonly EditorKey[]=[
 {label:'$ $',name:'inline maths',insert:'$$'},
 {label:'∀',name:'for all',insert:'\\forall '},{label:'∃',name:'there exists',insert:'\\exists '},
 {label:'∈',name:'element of',insert:'\\in '},{label:'⊆',name:'subset',insert:'\\subseteq '},
 {label:'→',name:'arrow',insert:'\\to '},{label:'⇒',name:'implies',insert:'\\implies '},
 {label:'ε',name:'epsilon',insert:'\\varepsilon'},{label:'δ',name:'delta',insert:'\\delta'},
 {label:'∞',name:'infinity',insert:'\\infty'},{label:'ℝ',name:'real numbers',insert:'\\mathbb{R}'},
 {label:'x²',name:'superscript',insert:'^{}'},{label:'xᵢ',name:'subscript',insert:'_{}'},
 {label:'a/b',name:'fraction',insert:'\\frac{}{}'},{label:'√',name:'square root',insert:'\\sqrt{}'},
 {label:'Σ',name:'sum',insert:'\\sum_{}^{}'},{label:'∫',name:'integral',insert:'\\int_{}^{}'},
];
/** Macro names from the settings text, one definition per line ("\R: \mathbb{R}", "\norm = ..."); at most eight. */
export function macroKeys(text:string):EditorKey[]{
 const out:EditorKey[]=[],seen=new Set<string>();
 for(const line of text.split(/\r?\n/)){
  const name=line.match(/^\s*"?(\\[A-Za-z]+)/)?.[1];
  if(!name||seen.has(name))continue;
  seen.add(name);out.push({label:name,name:'macro '+name,insert:name+' '});
  if(out.length>=8)break;
 }
 return out;
}
/** Insert at the selection. The caret lands inside the first empty braces or $…$ pair, else after the insertion. */
export function insertAt(value:string,start:number,end:number,text:string):{value:string;caret:number}{
 const from=Math.max(0,Math.min(start,value.length)),to=Math.max(from,Math.min(end,value.length));
 const next=value.slice(0,from)+text+value.slice(to);
 const hole=text==='$$'?1:text.indexOf('{}')>=0?text.indexOf('{}')+1:text.length;
 return {value:next,caret:from+hole};
}
