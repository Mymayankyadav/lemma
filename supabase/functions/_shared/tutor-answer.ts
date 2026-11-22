/** A text-compatible reference keeps answer order through existing draft/turn storage. */
const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
const referencePattern = () => new RegExp('\\[\\[lemma-image:(' + UUID + ')\\]\\]', 'gi')

export type TutorAnswerPart = {type:'text';text:string} | {type:'image';id:string}

export function imageReference(id:string):string {
  if(!new RegExp('^'+UUID+'$','i').test(id))throw new Error('Invalid image reference.')
  return '[[lemma-image:'+id.toLowerCase()+']]'
}

/** Unknown IDs stay text; this parser never grants access to an attachment. */
export function tutorAnswerParts(text:string,allowedIds?:Iterable<string>):TutorAnswerPart[] {
  const allowed=allowedIds===undefined?undefined:new Set([...allowedIds].map(id=>id.toLowerCase()))
  const parts:TutorAnswerPart[]=[]
  let at=0
  for(const match of text.matchAll(referencePattern())) {
    const id=match[1].toLowerCase()
    if(allowed&&!allowed.has(id))continue
    if(match.index!>at)parts.push({type:'text',text:text.slice(at,match.index)})
    parts.push({type:'image',id})
    at=match.index!+match[0].length
  }
  if(at<text.length)parts.push({type:'text',text:text.slice(at)})
  return parts
}

export function referencedImageIds(text:string):string[] {
  return [...new Set(tutorAnswerParts(text).flatMap(part=>part.type==='image'?[part.id]:[]))]
}
