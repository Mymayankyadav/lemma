import {describe,it,expect} from 'vitest';
import {unplacedReasonText,sessionStatusText,evidenceText,cardTypeText,noteKindText,ratingText,clientName,projectTitle,subjectName,checkpointTitle,plainCardText} from '../../../src/lib/labels';
describe('N121 reader-facing v6 labels',()=>{
 it('never returns machine reason codes',()=>{
  for(const code of ['too_long','after_due','no_estimate','no_capacity','unknown']){
   expect(unplacedReasonText(code)).not.toMatch(/_|unknown/);
  }
 });
 it('formats known enums and falls back to human text',()=>{
  expect(sessionStatusText('yes')).toBe('Demonstrated');
  expect(evidenceText('partial')).toBe('Partly there');
  expect(cardTypeText('basic')).toBe('Basic · question and answer');
  expect(noteKindText('other')).toBe('Other');
  expect(noteKindText('counterexample')).toBe('Counterexample');
  expect(ratingText(null)).toBe('Not rated');
  expect(ratingText(3)).toContain('Solid');
  expect(clientName('claude')).toBe('Claude');
 });
 it('maps ids only through available labels, never prints raw ids',()=>{
  expect(projectTitle('project-12',[{id:'project-12',slug:'analysis',title:'Real Analysis'}])).toBe('Real Analysis');
  expect(subjectName('subject-1',[{id:'subject-1',name:'Mathematics'}])).toBe('Mathematics');
  expect(checkpointTitle('cp-1',[{id:'cp-1',code:'CP3',title:'Compact sets'}])).toBe('Compact sets · CP3');
  expect(projectTitle('missing',[])).toBe('Linked path');
 });
 it('removes cloze syntax from text alternatives',()=>{
  expect(plainCardText('A {{c1::compact}} space $X$')).toBe('A compact space X');
 });
});
