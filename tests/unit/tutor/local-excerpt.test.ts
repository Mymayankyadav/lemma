import {describe,expect,it} from 'vitest'
import {addLocalTutorExcerpt,LOCAL_TUTOR_EXCERPT_LIMIT,previewLocalTutorExcerpt} from '../../../src/data/tutor/local-excerpt'
import {finalizeTutorTurn,submitTutorTurn,type TutorThreadHead} from '../../../src/data/tutor/turn-model'

const head: TutorThreadHead={threadId:'demo',lastSequence:0,pendingTurnId:null}
const base={question:'Could you check this argument?',selectedContext:[]}

describe('local tutor excerpt',()=>{
 it('rejects empty or oversized selections and never truncates approved text',()=>{
  expect(previewLocalTutorExcerpt('  \n')).toEqual({kind:'empty'})
  expect(previewLocalTutorExcerpt('x'.repeat(LOCAL_TUTOR_EXCERPT_LIMIT+1))).toEqual({kind:'too-long'})
  expect(previewLocalTutorExcerpt('x'.repeat(LOCAL_TUTOR_EXCERPT_LIMIT))).toMatchObject({kind:'preview'})
 })
 it('freezes only the attached excerpt without making it canonical citation context',()=>{
  const selected='  Assume $x=1$.\nThen use Lemma 2.  '
  const preview=previewLocalTutorExcerpt(selected)
  if(preview.kind!=='preview') throw new Error(preview.kind)
  expect(submitTutorTurn(head,'without',base)).not.toHaveProperty('turn.snapshot.localExcerpt')
  const editable={...addLocalTutorExcerpt(preview)}
  const result=submitTutorTurn(head,'t',{...base,localExcerpt:editable})
  editable.text='later edit'
  if(result.kind!=='submitted') throw new Error(result.kind)
  expect(result.turn.snapshot).toMatchObject({selectedContext:[],localExcerpt:{kind:'local-excerpt',text:selected}})
  expect(Object.isFrozen(result.turn.snapshot.localExcerpt)).toBe(true)
  expect(finalizeTutorTurn(result.head,result.turn,1,{
   turnId:'t',messageId:'m',body:'Body',provenance:{kind:'connector',reportedHost:null,hostVerified:false},
   citations:[{kind:'source',refId:'local-excerpt',version:'demo'}],suggestions:[],
  }).kind).toBe('unselected-citation')
 })
 it('rejects an invalid attachment before creating a pending turn',()=>{
  expect(submitTutorTurn(head,'t',{...base,localExcerpt:{kind:'local-excerpt',text:' '}}))
   .toEqual({kind:'invalid-local-excerpt'})
  expect(head.pendingTurnId).toBeNull()
 })
})
