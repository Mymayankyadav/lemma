export interface GlyphProps{subject:string;size?:32|40|48;active?:boolean;hue?:'amber'|'violet'|'cyan'|'rose'|'lime'|'slate'}
export function Glyph({subject,size=40,active=false,hue='amber'}:GlyphProps){
 const char=subject.trim().slice(0,2)||'∫';
 const ink=active?'var(--amber)':`var(--${hue})`;
 return <span role="img" aria-label={subject} className={`inline-flex shrink-0 items-center justify-center rounded-s font-math text-card italic ${active?'bg-amber-tint':'bg-fill-1'}`} style={{width:size,height:size,color:ink}}>{char}</span>;
}
export default Glyph;
