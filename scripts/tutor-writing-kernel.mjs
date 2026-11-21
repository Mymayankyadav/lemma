// Features for the experimental rankers. No learner intent or future text is
// accepted here; tutor roles are untrusted hints and never a safety grant.
import {normalizeTutorWritingContext} from '../src/features/tutor/writingAid/tutorContext.ts';
const protectedTerm = /\b(?:not|no|only|all|some|every|exists|injective|surjective|positive|negative|even|odd|infinite|finite|converges?|diverges?|therefore|hence|proof|because|implies)\b|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬]/iu;
const lower = text => String(text ?? '').toLocaleLowerCase();
const alpha = text => (lower(text).match(/[\p{L}\p{M}]+/gu) ?? []);

export function validSignals(context) {
  // The production normalizer rejects the whole payload on malformed or
  // mixed-source input; the experiment must not salvage extra features.
  return normalizeTutorWritingContext(context)?.signals ?? [];
}

export function features(request, proposal, originalIndex) {
  const label=lower(proposal.label), prefix=lower(proposal.before), insert=lower(proposal.insert);
  const signals=validSignals(request.tutorContext), before=request.anchor?.text.slice(request.anchor.start, proposal.start) ?? '';
  const ownWords=alpha(before), prev=ownWords.at(-1) ?? '';
  const hit=role => signals.some(s => s.role===role && lower(s.text).includes(label) && label.length >= 3);
  const hits=role => Math.min(3,signals.filter(s => s.role===role && lower(s.text).includes(label) && label.length >= 3).length)/3;
  const inventories=signals.filter(s=>['prompt','given','suggested-wording'].includes(s.role));
  const vars=inventories.some(s=>(s.variables ?? []).some(v=>lower(v)===label));
  const syms=inventories.some(s=>(s.symbols ?? []).some(v=>lower(v)===label));
  const occurrence=ownWords.filter(x=>x===label).length;
  const values=[1, Number(proposal.kind==='word'), Number(proposal.kind==='ghost'),
    Number(proposal.kind==='correction'), Number(proposal.kind==='replace'),
    Math.min(1,prefix.length/12), Math.min(1,label.length/32), Math.min(1,insert.length/32),
    Math.min(1,Math.max(0,label.length-prefix.length)/20), 1/(1+originalIndex),
    Number(hit('prompt')), Number(hit('given')), Number(hit('suggested-wording')),
    Number(hit('hint')), Number(vars), Number(syms), Math.min(3,occurrence)/3,
    Number(Boolean(prev) && label.startsWith(prev)), Number(/[\d]/u.test(label)),
    Number(protectedTerm.test(label)), Number(/[^\p{L}\p{M}\s]/u.test(label)),
    Number(prefix.length>=4), Number(prefix.length>=5), label.length ? Math.min(1,prefix.length/label.length) : 0,
    Math.min(1,signals.length/12), hits('prompt'), hits('given'), hits('suggested-wording'),
    Number(request.mode==='strict'), Number(request.mode==='fast'),
    Number(proposal.kind==='word' && prefix.length>0 && label.startsWith(prefix)),
    Number(proposal.kind==='ghost' && insert.length>0 && !protectedTerm.test(insert))];
  return values;
}

export function mathRisk(text) {return protectedTerm.test(String(text ?? ''));}
export const DIM = 32;
