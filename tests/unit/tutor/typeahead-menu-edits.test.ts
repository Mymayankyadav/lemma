import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {applyMenuEdit, proseSymbol} from '../../../src/features/tutor/writingAid/menuEdit';
import {contextualWording, tutorHint} from '../../../src/features/tutor/writingAid/answerAids';
import {insertionEligible} from '../../../src/features/tutor/writingAid/eligibility';
import {applyWritingAidProposal, proposalEligible, writingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import {predictWritingAidPool} from '../../../src/features/tutor/writingAid/engine';
import {historyIds, historyLog, historyNext, historyWords, parseNgram, prepareRightContext, setNgramModel} from '../../../src/features/tutor/writingAid/decoder/kn';
import {setDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import {declaredMenuCandidates, literalMenuCandidates, prepareMenuCopies} from '../../../src/features/tutor/writingAid/menuCandidates';
import {actionMenuScore} from '../../../src/features/tutor/writingAid/menuRanking';
import {resolveMenuTrial} from '../../../src/features/tutor/writingAid/menuTrial';
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
  it('offers exact supplied punctuation and spacing only after a learner-authored opening', () => {
    const before = 'We write On the ', prefix = 'ot';
    const entry = 'other  hand,';
    const aid = {...scaffold, wording: ['On the ' + entry]};
    const r = request(before + prefix, aid);
    const context = {aid, before, prefix, mode: 'prose' as const};
    expect(literalMenuCandidates(r, context).map(row => row.insert)).toContain(entry);
    expect(literalMenuCandidates({...r, acceptedSpans: [{start: 9, end: 11}]}, context)).toHaveLength(0);
    expect(literalMenuCandidates(r, {...context, before: before.toLowerCase()})).toHaveLength(0);
    const interior = {...r, cursor: padEdit(r.cursor.text + ', next', r.cursor.end)};
    expect(literalMenuCandidates(interior, context).map(row => row.insert)).not.toContain(entry);
  });
  it('copies exact terms, excludes assisted paragraph occurrences and preserves a Unicode middle-edit range', () => {
    const before = '𝛼 We use ', prefix = 'Qua', suffix = ' for the proof.';
    const text = before + prefix + suffix;
    const end = before.length + prefix.length;
    const r = {...request(text), cursor: padEdit(text, end), anchor: {text, start: before.length, caret: end},
      question: ['QuasiMap, a useful tool.'], expanded: true, middleEdits: true, menuTrial: 'm1' as const};
    const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v2/model.bin')));
    setNgramModel(model);
    setDecoderLexicon({version: 1, entries: [{word: 'quasimap', frequency: 120}]});
    const proposal = predictWritingAidPool(r).words.find(row => row.source === 'question' && row.insert === 'QuasiMap,');
    expect(proposal).toBeDefined();
    expect(applyWritingAidProposal(r, proposal!)).toEqual(padEdit(before + 'QuasiMap,' + suffix, before.length + 9));
    expect(applyWritingAidProposal({...r, menuTrial: 'm2'}, proposal!)).toBeNull();
    const paragraph = 'QuasiMap, used earlier.\n\nQuasiRange is given. ';
    const copied = prepareMenuCopies({...r, question: [], acceptedSpans: [{start: paragraph.indexOf('QuasiRange'), end: 36}]},
      paragraph, prefix, () => -2);
    expect(copied.candidates).toHaveLength(0);
    expect(copied.recurrence('QuasiMap')).toEqual([0, 0]);
    const cropped = prepareMenuCopies({...r, question: [' '.repeat(635) + 'QuasiMap supplies the notation.']},
      before, prefix, () => -2);
    expect(cropped.candidates).toHaveLength(0);
    const denied = predictWritingAidPool({...r, aid: {...scaffold, withhold: ['QuasiMap for']}}).words;
    expect(denied.some(row => row.insert.startsWith('QuasiMap'))).toBe(false);
  });
  it('keeps scoped identifier case and admits neither an ambiguous nor a bound declaration', () => {
    const aid: TutorAnswerAid = {...scaffold, ranking: {version: 1, declaredSymbols: [
      {symbol: 'X_1', role: 'set'}, {symbol: 'X_2', role: 'bound', binder: {id: 'binding'}},
      {symbol: 'X_3', role: 'set'}, {symbol: 'X_3', role: 'ambient'}, {symbol: 'x_1', role: 'map'},
    ]}};
    const before = 'Our notation is ', prefix = 'X';
    const r = request(before + prefix, aid);
    const choices = declaredMenuCandidates(r, {aid, before, prefix, mode: 'prose'});
    expect(choices.map(row => row.insert)).toEqual(['X_1 ']);
    expect(declaredMenuCandidates({...r, acceptedSpans: [{start: before.length, end: r.cursor.end}]},
      {aid, before, prefix, mode: 'prose'})).toHaveLength(0);
  });
  it('scores only the visible right context and ablates signed priorities without changing eligibility', () => {
    const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v2/model.bin')));
    const before = 'It is a ', suffix = ' theorem';
    const following = model.id.get('theorem')!;
    const score = prepareRightContext(model, before, suffix);
    expect(score?.('useful')).toBeCloseTo(historyLog(model, following, historyIds(model, before + 'useful ')) -
      historyLog(model, following, historyIds(model, before)), 9);
    expect(prepareRightContext(model, before, '')).toBeUndefined();
    expect(prepareRightContext(model, before, '. Another sentence.')).toBeUndefined();
    expect(actionMenuScore(-2, Math.log(2), [], 'm1', undefined, '')).toBe(-2 + Math.log(2));
    expect(actionMenuScore(-2, Math.log(2), [], 'm1-neutral', undefined, '')).toBe(-2);
    for (const trial of ['m1', 'm1-neutral', 'm2', 'm2-tutor', 'm2-right', 'unverified']) {
      expect(resolveMenuTrial('?typeahead-menu=' + trial, false, true)).toBeUndefined();
    }
    expect(resolveMenuTrial('?typeahead-menu=m1', true, false)).toBeUndefined();
    expect(resolveMenuTrial('?typeahead-menu=m1', true, true)).toBe('m1');
  });
  it('holds the three-slot trial shortlist and sources fixed when Tutor priority is reversed', () => {
    const model = parseNgram(new Uint8Array(readFileSync('public/models/typeahead/ngram-v2/model.bin')));
    setNgramModel(model);
    setDecoderLexicon({version: 1, entries: [{word: 'example', frequency: 120}, {word: 'case', frequency: 120}]});
    const before = 'We write in this ';
    const scope = {subject: 'algebra', step: 'restating', mode: 'prose' as const, phraseStates: ['in this']};
    const sample = (prefer: AidPriority, demote: AidPriority, step = scope.step) => {
      const aid: TutorAnswerAid = {...scaffold, wording: ['in this example', 'in this case'], ranking: {version: 1, hints: [
        {id: 'case', kind: 'phrase', entry: 'in this case', priority: demote, role: 'neutral', scope},
        {id: 'example', kind: 'phrase', entry: 'in this example', priority: prefer, role: 'neutral', scope},
      ]}};
      return predictWritingAidPool({...request(before, aid), expanded: true, menuTrial: 'm1', subject: scope.subject, step}).words;
    };
    const favored = sample('prefer', 'deemphasize'), reversed = sample('deemphasize', 'prefer');
    const neutral = sample('neutral', 'neutral'), absent = sample('prefer', 'deemphasize', 'another-step');
    const ids = (items: typeof favored) => items.map(item => [item.start, item.end, item.insert, item.source, item.menuBase]);
    for (const compared of [reversed, neutral, absent]) expect(ids(compared)).toEqual(ids(favored));
    for (const label of ['example', 'case']) {
      const value = (items: typeof favored) => items.find(row => row.label === label)?.tutorAdjustment;
      expect(value(favored)).toBe(-value(reversed)!);
      expect(value(neutral)).toBe(0);
      expect(value(absent)).toBe(0);
    }
    const choices: TutorAnswerAid = {...scaffold, ranking: {version: 1, hints: [
      {id: 'i', kind: 'word', entry: 'injective', priority: 'prefer', role: 'goal'},
      {id: 's', kind: 'word', entry: 'surjective', priority: 'prefer', role: 'alternative'},
    ]}};
    const gap = predictWritingAidPool({...request('Therefore the map is ', choices), expanded: true, menuTrial: 'm1'}).words;
    expect(gap.some(item => /injective|surjective/u.test(item.insert))).toBe(false);
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
