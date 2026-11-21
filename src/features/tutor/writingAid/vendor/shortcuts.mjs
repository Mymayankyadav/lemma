// An explicit trigger followed by a confirmation tap. A chord spells a fixed
// phrase. It never selects variables, fills blanks or uses neighboring premises.
export const shortcuts = Object.freeze({
  wts:'we want to show that', ets:'it is enough to show that', wlog:'without loss of generality',
  iff:'if and only if', wrt:'with respect to', st:'such that', def:'by definition',
  asm:'by assumption', ind:'by induction', dfn:'the definition of', olt:'on the other hand',
  itf:'it follows that', tof:'to see this', inpar:'in particular', nt:'note that',
  henc:'hence', thf:'therefore', bds:'both sides', elof:'is an element of', subof:'is a subset of',
  nonempty:'is nonempty', eps:'ε', delta:'δ', in:'∈', notin:'∉', sub:'⊆', lt:'<', le:'≤', ge:'≥',
  all:'∀', ex:'∃', ne:'≠', imp:'⇒', equiv:'⇔', inf:'∞'
});
export function shortcut(text) {
  if(typeof text!=='string')return null;
  const m=text.match(/(?:^|\s)(;([a-zA-Z]+))$/u);
  if(!m)return null;
  const code=m[2];let value=shortcuts[code.toLowerCase()];
  if(!value || !/^(?:[a-z]+|[A-Z][a-z]*)$/u.test(code))return null;
  if(/^[A-Z]/u.test(code))value=value[0].toUpperCase()+value.slice(1);
  return {source:m[1],replacement:value};
}
