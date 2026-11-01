/** Extract cloze card ordinals without loading the full rich-text renderer.
 * This is byte-for-byte equivalent to legacyRender.clozeOrds: preserve the
 * legacy regex, including its handling of repeated and zero-padded ordinals.
 */
export function clozeOrds(src:string):number[] {
 const set=new Set<number>();
 const re=/\{\{c(\d+)::/g;
 let match:RegExpExecArray|null;
 while((match=re.exec(src||''))!==null)set.add(+match[1]);
 return [...set].sort((a,b)=>a-b);
}
