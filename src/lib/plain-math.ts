/** Readable non-LaTeX labels for SVG, aria and other places without HTML.
 * The HTML interface should use <Tex /> instead. This is deliberately a
 * fallback for short math labels, not a complete TeX interpreter.
 */
const symbols: Record<string,string> = {
  mapsto:'↦',to:'→',rightarrow:'→',leftarrow:'←',leftrightarrow:'↔',
  implies:'⇒',iff:'⇔',in:'∈',notin:'∉',subset:'⊂',subseteq:'⊆',supseteq:'⊇',
  cup:'∪',cap:'∩',emptyset:'∅',varnothing:'∅',forall:'∀',exists:'∃',
  times:'×',cdot:'·',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',
  alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',varepsilon:'ε',theta:'θ',
  lambda:'λ',mu:'μ',pi:'π',sigma:'σ',tau:'τ',phi:'φ',varphi:'φ',
  Gamma:'Γ',Delta:'Δ',Sigma:'Σ',Pi:'Π',infty:'∞',circ:'∘',oplus:'⊕',
};
const blackboard: Record<string,string>={R:'ℝ',N:'ℕ',Z:'ℤ',Q:'ℚ',C:'ℂ',F:'𝔽',P:'ℙ'};
const superscript: Record<string,string>={0:'⁰',1:'¹',2:'²',3:'³',4:'⁴',5:'⁵',6:'⁶',7:'⁷',8:'⁸',9:'⁹',n:'ⁿ',i:'ⁱ',H:'ᴴ',T:'ᵀ',m:'ᵐ',x:'ˣ',k:'ᵏ',a:'ᵃ',b:'ᵇ','+':'⁺','-':'⁻'};
const subscript: Record<string,string>={0:'₀',1:'₁',2:'₂',3:'₃',4:'₄',5:'₅',6:'₆',7:'₇',8:'₈',9:'₉',n:'ₙ',i:'ᵢ',k:'ₖ',m:'ₘ',x:'ₓ',a:'ₐ',b:'ᵦ'};
const raised=(text:string,alphabet:Record<string,string>)=>Array.from(text).map(ch=>alphabet[ch]||ch).join('');
export function plainMath(source:string):string{
  return source
    .replace(/\\mathbb\{([^}]*)\}/g,(_,name:string)=>Array.from(name).map(ch=>blackboard[ch]||ch).join(''))
    .replace(/\\(?:mathcal|mathrm|mathbf|operatorname|text)\{([^}]*)\}/g,'$1')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'($1/$2)')
    .replace(/\\([A-Za-z]+)/g,(_,cmd:string)=>symbols[cmd]??cmd)
    .replace(/\\(?:\(|\)|\[|\])/g,'')
    .replace(/\\([{}[\](),.;:!?%$])/g,'$1')
    .replace(/\^\{([^}]+)\}/g,(_,value:string)=>raised(value,superscript))
    .replace(/\^([A-Za-z0-9+-])/g,(_,value:string)=>raised(value,superscript))
    .replace(/_\{([^}]+)\}/g,(_,value:string)=>raised(value,subscript))
    .replace(/_([A-Za-z0-9])/g,(_,value:string)=>raised(value,subscript))
    .replace(/\$\$?|\u005c\(|\u005c\)|\u005c\[|\u005c\]/g,'')
    .replace(/[\\$]/g,'');
}
