/** PLAN §6.11: the editor's key row. V34 (v7 UX audit r3): the four helpers people reach for first lead it (fraction,
 *  sum, integral, set braces), then the owner's own KaTeX macros, then the other symbols. Pure for testing. */
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
 {label:'{ }',name:'set braces',insert:'\\{ \\}'},
];
const LEAD=['fraction','sum','integral','set braces'];
/** The whole key row: the four lead helpers, the owner's macros (from Settings), then the remaining symbols. */
export function editorKeys(macros:string):EditorKey[]{
 const lead=LEAD.map(name=>symbolKeys.find(key=>key.name===name)!);
 return [...lead,...macroKeys(macros),...symbolKeys.filter(key=>!LEAD.includes(key.name))];
}
/** Macro names from the settings text, one definition per line ("\R: \mathbb{R}", "\norm = ...", or a LaTeX preamble line
 *  such as "\newcommand{\R}{\mathbb{R}}" or "\DeclareMathOperator{\tr}{tr}"); at most eight. V34: a preamble line names the
 *  macro it defines, never "\newcommand" itself. */
export function macroKeys(text:string):EditorKey[]{
 const out:EditorKey[]=[],seen=new Set<string>();
 for(const line of text.split(/\r?\n/)){
  const name=line.match(/^\s*\\(?:re|provide)?newcommand\*?\s*\{?\s*(\\[A-Za-z]+)/)?.[1]
   ??line.match(/^\s*\\DeclareMathOperator\*?\s*\{\s*(\\[A-Za-z]+)/)?.[1]
   ??line.match(/^\s*\\def\s*(\\[A-Za-z]+)/)?.[1]
   ??line.match(/^\s*"?(\\[A-Za-z]+)/)?.[1];
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
 const hole=text==='$$'?1:text.indexOf('{}')>=0?text.indexOf('{}')+1:text.indexOf('\\{ ')>=0?text.indexOf('\\{ ')+3:text.length;
 return {value:next,caret:from+hole};
}
