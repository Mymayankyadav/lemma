import {describe,expect,it} from 'vitest';
import {imageReference,referencedImageIds,tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';

const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
describe('ordered learner answer',()=>{
  it('retains exact prose, newlines and image positions across repeated typing/drawing',()=>{
    const text='Let α ∈ A.\n'+imageReference(second)+'\nChoose ε > 0. '+imageReference(first)+' Hence x ∈ U.';
    expect(tutorAnswerParts(text,[first,second])).toEqual([
      {type:'text',text:'Let α ∈ A.\n'},{type:'image',id:second},{type:'text',text:'\nChoose ε > 0. '},
      {type:'image',id:first},{type:'text',text:' Hence x ∈ U.'},
    ]);
    expect(referencedImageIds(text+imageReference(second))).toEqual([second,first]);
  });
  it('does not treat foreign IDs or malformed markers as authorized attachments',()=>{
    const text='Text '+imageReference(second)+' [[lemma-image:../../private]] '+imageReference(first);
    expect(tutorAnswerParts(text,[first])).toEqual([
      {type:'text',text:'Text '+imageReference(second)+' [[lemma-image:../../private]] '},{type:'image',id:first},
    ]);
    expect(()=>imageReference('../private')).toThrow('Invalid image reference');
  });
  it('preserves plain, empty and image-only answers',()=>{
    expect(tutorAnswerParts('')).toEqual([]);
    expect(tutorAnswerParts('ε > 0')).toEqual([{type:'text',text:'ε > 0'}]);
    expect(tutorAnswerParts(imageReference(first),[first])).toEqual([{type:'image',id:first}]);
  });
});
