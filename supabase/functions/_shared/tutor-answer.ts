/** A text-compatible reference keeps answer order through existing draft/turn storage. */
const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
const referencePattern = () => new RegExp('\\[\\[lemma-image:(' + UUID + ')\\]\\]', 'gi')

const SOURCES = ['word','phrase','symbol','equation','neural','ngram','personal','tutor'] as const
export type TutorAcceptedSpan = Readonly<{
  start:number; end:number; text:string; source:typeof SOURCES[number]; aidId?:string; aidVersion?:number
}>
export type TutorAnswerPart = {type:'text';text:string;accepted?:Omit<TutorAcceptedSpan,'start'|'end'|'text'>} | {type:'image';id:string}

/** Only retained, disjoint UTF-16 spans of the exact saved answer can carry provenance. */
export function readTutorAcceptedSpans(text:string,value:unknown):TutorAcceptedSpan[] {
  if(!Array.isArray(value)||value.length>32)return []
  const images=[...text.matchAll(referencePattern())]
  const spans:TutorAcceptedSpan[]=[]
  let end=0
  for(const entry of value) {
    if(typeof entry!=='object'||entry===null||Array.isArray(entry)||
       Object.keys(entry).some(key=>!['start','end','text','source','aidId','aidVersion'].includes(key))||
       !Number.isInteger(entry.start)||!Number.isInteger(entry.end)||entry.start<end||entry.end<=entry.start||
       entry.end>text.length||entry.end-entry.start>2000||entry.text!==text.slice(entry.start,entry.end)||
       !/\S/u.test(entry.text)||!SOURCES.includes(entry.source)||
       /[\uD800-\uDFFF]/u.test(entry.text)||
       images.some(image=>image.index!<entry.end&&image.index!+image[0].length>entry.start))return []
    if(entry.aidId!==undefined||entry.aidVersion!==undefined) {
      if(typeof entry.aidId!=='string'||!new RegExp('^'+UUID+'$','i').test(entry.aidId)||
         !Number.isInteger(entry.aidVersion)||entry.aidVersion<1||entry.aidVersion>2147483647)return []
    }
    spans.push({...entry})
    end=entry.end
  }
  return spans
}

export function imageReference(id:string):string {
  if(!new RegExp('^'+UUID+'$','i').test(id))throw new Error('Invalid image reference.')
  return '[[lemma-image:'+id.toLowerCase()+']]'
}

/** Unknown IDs stay text; this parser never grants access to an attachment. */
export function tutorAnswerParts(text:string,allowedIds?:Iterable<string>,accepted?:unknown):TutorAnswerPart[] {
  const allowed=allowedIds===undefined?undefined:new Set([...allowedIds].map(id=>id.toLowerCase()))
  const parts:TutorAnswerPart[]=[]
  const spans=readTutorAcceptedSpans(text,accepted)
  let at=0, spanIndex=0
  function addText(to:number) {
    while(spanIndex<spans.length&&spans[spanIndex].end<=to) {
      const span=spans[spanIndex++]
      if(span.start>at)parts.push({type:'text',text:text.slice(at,span.start)})
      const {source,aidId,aidVersion}=span
      parts.push({type:'text',text:span.text,accepted:{source,...(aidId?{aidId,aidVersion}:{})}})
      at=span.end
    }
    if(to>at)parts.push({type:'text',text:text.slice(at,to)})
  }
  for(const match of text.matchAll(referencePattern())) {
    const id=match[1].toLowerCase()
    if(allowed&&!allowed.has(id))continue
    addText(match.index!)
    parts.push({type:'image',id})
    at=match.index!+match[0].length
  }
  addText(text.length)
  return parts
}

export function referencedImageIds(text:string):string[] {
  return [...new Set(tutorAnswerParts(text).flatMap(part=>part.type==='image'?[part.id]:[]))]
}
