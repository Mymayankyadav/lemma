import {describe,expect,it} from 'vitest';
import {packTutorWritingReply,unpackTutorWritingReply,validTutorWritingPayload} from '../../../supabase/functions/_shared/tutor-writing';
import {normalizeTutorWritingContext} from '../../../src/features/tutor/writingAid/tutorContext';

const body='For the set X, use ε for epsilon. You can ask: I would like to check my wording.';
const payload={version:1,revision:'turn-1',signals:[{id:'phrase',sourceId:'tutor-claimed-id',role:'suggested-wording',
  text:'I would like to check my wording.',variables:['X'],symbols:['ε']}]};

describe('optional tutor writing signals',()=>{
  it('round trips via the existing body contract without changing the visible question',()=>{
    const command={body,nextQuestion:'I would like to check my wording.',messageId:'actual-message',writingAid:payload};
    const packed=packTutorWritingReply(command);
    expect(packed).not.toHaveProperty('writingAid');
    expect(packed.nextQuestion).toBe(command.nextQuestion);
    expect(unpackTutorWritingReply(packed.body as string)).toEqual({body,context:payload});
    const context=normalizeTutorWritingContext(unpackTutorWritingReply(packed.body as string).context,'actual-message');
    expect(context?.signals[0].sourceId).toBe('actual-message');
    expect(packTutorWritingReply(command)).toEqual(packed);
  });
  it('leaves legacy replies unchanged and ignores malformed metadata',()=>{
    expect(packTutorWritingReply({body})).toEqual({body});
    for(const writingAid of [null,{}, {...payload,signals:Array(13).fill(payload.signals[0])},
      {...payload,signals:[{...payload.signals[0],text:'a'.repeat(241)}]},
      {...payload,signals:[{...payload.signals[0],variables:['x'.repeat(33)]}]}]){
      expect(validTutorWritingPayload(writingAid)).toBe(false);
      expect(packTutorWritingReply({body,writingAid})).toEqual({body});
    }
  });
  it('cannot smuggle an unseen solution or identifier into hidden metadata',()=>{
    for(const signal of [{...payload.signals[0],text:'Use induction and the proof is complete'},
      {...payload.signals[0],variables:['secret_witness']},{...payload.signals[0],symbols:['∃']}]){
      const writingAid={...payload,signals:[signal]};
      expect(packTutorWritingReply({body,writingAid})).toEqual({body});
      const forged=body+'\n\n```lemma-writing-v1\n'+JSON.stringify(writingAid)+'\n```';
      expect(unpackTutorWritingReply(forged)).toEqual({body:forged});
    }
  });
  it('never truncates a long reply or hides incomplete ordinary code fences',()=>{
    const long=body+'a'.repeat(12000-body.length);
    expect(packTutorWritingReply({body:long,writingAid:payload})).toEqual({body:long});
    for(const text of [body+'\n\n```lemma-writing-v1\n{broken}\n```',
      body+'\n```json\n'+JSON.stringify(payload)+'\n```',
      body+'\n\n```lemma-writing-v1\n'+JSON.stringify(payload),
      body+'\n\n```lemma-writing-v1\n'+JSON.stringify(payload)+'\n```\nvisible text']){
      expect(unpackTutorWritingReply(text)).toEqual({body:text});
    }
  });
  it('requires prose content rather than hidden comments, code or link destinations',()=>{
    for(const hidden of ['<!--'+body+'-->','```text\n'+body+'\n```','<script>'+body+'</script>',
      '[Question]('+body+')']){
      expect(packTutorWritingReply({body:'What do you think? '+hidden,writingAid:payload}))
        .toEqual({body:'What do you think? '+hidden});
    }
  });
});
