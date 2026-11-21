/** Optional keyboard metadata travels inside the existing private reply body.
 * No new database fields, grants or writes are required. Old clients can display
 * the fenced payload; new clients hide only a complete, validated suffix.
 */
export const TUTOR_WRITING_INSTRUCTIONS = [
  'Include optional writingAid in the reply patch to help the learner type their own answer.',
  'Use {version:1,revision:<short string>,signals:[{id:<short string>,sourceId:<messageId>,role:<role>,text:<exact visible fragment>,variables:[<names>],symbols:[<glyphs>]}]}.',
  'Roles are prompt, given, suggested-wording, hint, proof, solution or unknown. Classify honestly: a proposed proof step is proof, never suggested-wording.',
  'Provide at most 12 fragments of 240 characters, with at most 16 variables and 16 symbols per fragment. Copy every fragment verbatim from the visible reply body. Include only symbols and variables already named there.',
  'Useful signals are the current question, given definitions, notation and neutral response wording. Do not add hints or solutions for the keyboard, infer the learner’s intended variable, or correct their reasoning.',
  'The client treats these as untrusted writing hints. It requires learner-authored matching text and independently blocks unchosen proof steps. Missing metadata leaves normal typing available.',
].join(' ')

const marker = '\n\n```lemma-writing-v1\n'
const roles = new Set(['prompt','given','suggested-wording','hint','proof','solution','unknown'])
const record = (value:unknown):value is Record<string,unknown> => value!==null && typeof value==='object' && !Array.isArray(value)
const short = (value:unknown,limit:number):value is string => typeof value==='string' && value.length>0 && value.length<=limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
// Metadata may not cite hidden HTML/comments, code blocks or link destinations.
// The editor still applies its own semantic checks to the remaining prose.
const visibleProse = (body:string) => body.replace(/<!--[^]*?-->/gu,'')
  .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/giu,'')
  .replace(/```[^]*?```|~~~[^]*?~~~/gu,'')
  .replace(/\[([^\]]*)\]\([^)]*\)/gu,'$1').replace(/<[^>]*>/gu,'')
const grounded = (signals:Record<string,unknown>[],body:string) => {
  const visible=visibleProse(body)
  return signals.every(signal=>visible.includes(signal.text as string) &&
    ['variables','symbols'].every(key=>!Array.isArray(signal[key]) || signal[key].every((term:string)=>visible.includes(term))))
}

/** Structural validation only: permission to suggest still belongs to the editor. */
export function validTutorWritingPayload(value:unknown):boolean {
  if (!record(value) || value.version!==1 || !short(value.revision,120) ||
      !Array.isArray(value.signals) || value.signals.length>12) return false
  return value.signals.every(signal=>record(signal) && short(signal.id,120) && short(signal.sourceId,120) &&
    typeof signal.role==='string' && roles.has(signal.role) && short(signal.text,240) &&
    ['variables','symbols'].every(key=>signal[key]===undefined || Array.isArray(signal[key]) &&
      signal[key].length<=16 && signal[key].every((entry:unknown)=>short(entry,32))))
}

/** Preserve the existing RPC contract and idempotency; do not truncate a reply. */
export function packTutorWritingReply(command:Record<string,unknown>):Record<string,unknown> {
  if (!Object.hasOwn(command,'writingAid')) return command
  const {writingAid,...rest}=command
  if (typeof rest.body!=='string' || !validTutorWritingPayload(writingAid) || rest.body.includes(marker)) return rest
  const signals=(writingAid as {signals:Record<string,unknown>[]}).signals
  // A hidden fragment must not carry material the learner was never shown.
  if (!grounded(signals,rest.body)) return rest
  const encoded=rest.body+marker+JSON.stringify(writingAid)+'\n```'
  return encoded.length<=12000 ? {...rest,body:encoded} : rest
}

export function unpackTutorWritingReply(body:string):{body:string;context?:unknown} {
  const at=body.lastIndexOf(marker)
  if (at<1 || !body.endsWith('\n```') || body.length>12000) return {body}
  try {
    const context:unknown=JSON.parse(body.slice(at+marker.length,-4))
    if (!validTutorWritingPayload(context)) return {body}
    const visible=body.slice(0,at)
    const signals=(context as {signals:Record<string,unknown>[]}).signals
    if (!grounded(signals,visible)) return {body}
    return {body:visible,context}
  } catch {return {body}}
}
