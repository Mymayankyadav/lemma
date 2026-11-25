import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {applyMenuEdit, proseSymbol} from '../../../src/features/tutor/writingAid/menuEdit';
import {contextualWording, tutorHint} from '../../../src/features/tutor/writingAid/answerAids';
import {insertionEligible} from '../../../src/features/tutor/writingAid/eligibility';
import {applyWritingAidProposal, proposalEligible, writingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import {predictWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {historyNext, historyWords, parseNgram, setNgramModel} from '../../../src/features/tutor/writingAid/decoder/kn';
import {setDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import type {AidPriority, TutorAnswerAid} from '../../../supabase/functions/_shared/tutor-answer-aids';

function request(text: string, aid?: TutorAnswerAid): WritingAidRequest {
  return {cursor: padEdit(text), anchor: {text, start: 0}, mode:'balanced', composing:false, readOnly:false, aid,
    target:{scopeKey:'owner', mountId:'composer', editorRevision:1, selectionRevision:1, modeRevision:1}};
}
const scaffold: TutorAnswerAid = {id:'a', turnId:'b', version:1, level:'scaffold', wording:[], terms:[], symbols:[], withhold:[]};
describe('exact edits, tutor choices and ordered count candidates', () => {
  afterEach(() => {setNgramModel(null); setDecoderLexicon(null); vi.unstubAllEnvs();});
  it('preserves UTF-16 selection, punctuation, notation and learner evidence', () => {
    expect(applyMenuEdit('𝛼 x!', {start:3,end:4,insert:'{□}',caret:4,selectionEnd:5})).toEqual(padEdit('𝛼 {□}!',4,5));
    expect(proseSymbol('Use $α$ then ', 'x_1',' ')).toBe('$x_1$');
    expect(proseSymbol('Use \\(α\\) then ', 'x',' ')).toBe('\\(x\\)');
    expect(proseSymbol('Use $α$ then ', 'x',' ',[{start:4,end:7}])).toBe('x ');
    expect(proseSymbol('Use $α$.\n\nNow ', 'x',' ')).toBe('x ');
    expect(proseSymbol('In $x + ', 'α',' ')).toBe('α');
    expect(proseSymbol('In prose ', 'α','')).toBe('α');
  });
  it('exercises 100 matched preferred/neutral/demoted contexts and scoped reversals', () => {
    const starters = ['upper','lower','local','global','fixed','usual','initial','second','outer','inner'];
    const names = ['bound','limit','value','term','point','map','index','sum','range','set'];
    for (const starter of starters) for (const [i, name] of names.entries()) {
      const other = names[(i+1)%names.length], left = starter+' '+name, right=starter+' '+other;
      const scores = (priority: AidPriority, step: string) => {
        const aid: TutorAnswerAid = {...scaffold, wording:[left,right], ranking:{version:1,hints:[
          {id:'a',kind:'phrase',entry:left,priority,role:'neutral',scope:{step:'restating'}},
          {id:'b',kind:'phrase',entry:right,priority:'neutral',role:'neutral',scope:{step:'restating'}},
        ]}};
        const context = {aid, before:'We use the '+starter+' ',prefix:'',mode:'prose' as const, step, allowPhraseTaps:true, anchorStart:0};
        expect(contextualWording(context).map(x => x.text)).toEqual(expect.arrayContaining([name,other]));
        return tutorHint(context,name).adjustment - tutorHint(context,other).adjustment;
      };
      expect(scores('prefer','restating')).toBeGreaterThan(0);
      expect(scores('deemphasize','restating')).toBeLessThan(0);
      expect(scores('neutral','restating')).toBe(0);
      expect(scores('deemphasize','new-step')).toBe(0);
    }
  });
  it('rejects 100 withheld menu and tap cases, while admitting their near misses', () => {
    const starts = ['upper','lower','local','outer','inner','first','second','common','ordinary','usual'];
    const ends = ['bound','range','sum','point','term','part','line','map','index','value'];
    for (const a of starts) for (const b of ends) {
      const aid={...scaffold,withhold:[a+' '+b]}, r=request('We use '+a+' ',aid);
      const blocked=writingAidProposal(r,'word',r.cursor.end,r.cursor.end,b+' ');
      const permitted=writingAidProposal(r,'word',r.cursor.end,r.cursor.end,'other ');
      expect(proposalEligible(r,blocked)).toBe(false);
      expect(applyWritingAidProposal(r,blocked)).toBeNull();
      expect(applyWritingAidProposal(r,permitted)?.text).toBe(r.cursor.text+'other ');
      expect(insertionEligible({text:a+b,start:a.length,end:a.length,insert:' ',mode:'prose',aid})).toBe(false);
    }
  });
  it('bounds tutor wording and checks the authored phrase lead-in', () => {
    const ctx={aid:{...scaffold,wording:['upper part of the sum']},before:'We use an upper ',prefix:'',mode:'prose' as const,allowPhraseTaps:true};
    expect(contextualWording(ctx).map(r=>r.text)).toContain('part of the');
    expect(contextualWording({...ctx, acceptedSpans:[{start:10,end:15}]}).map(r=>r.text)).not.toContain('part of the');
    expect(contextualWording({...ctx,anchorStart:15}).map(r=>r.text)).not.toContain('part of the');
  });
  it('retains the exhaustive continuation and eligible ordering for the shipped pack', () => {
    vi.stubEnv('VITE_FLAGS','typeaheadV2');
    const m=parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v2/model.bin')));
    setNgramModel(m);
    setDecoderLexicon({version:1,entries:['name','notion','notation','words','points'].map(word=>({word,frequency:120}))});
    for (const h of [[0,0,0],[0],[m.id.get('the')!],[m.id.get('take')!,m.id.get('the')!]]) {
      for(const prefix of ['a','pre','xyz','𝛼']) expect(historyWords(m,h,prefix)).toEqual(historyNext(m,h).filter(id=>id>4).map(id=>m.words[id]).filter(w=>w.startsWith(prefix)));
    }
    for (const text of ['We use the ','We use a no','Hence the following ']) {
      const r=request(text), normal=predictWritingAidPool(r), oracle=predictWritingAidPool({...r,exhaustivePool:true});
      expect(normal.words.map(x=>[x.start,x.end,x.insert,x.score])).toEqual(oracle.words.map(x=>[x.start,x.end,x.insert,x.score]));
    }
  });
});
