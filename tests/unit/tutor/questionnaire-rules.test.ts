import {describe, expect, it} from 'vitest';
import {answersFit, questionnaireComplete, questionnaireIssues, type QuestionnaireQuestion} from '../../../supabase/functions/_shared/tutor-questionnaire';

// N228 (Owner): the rules the tutor's questionnaire and the learner's answers follow, the same as the database's.
const questions: QuestionnaireQuestion[] = [
  {id: 'q1', kind: 'short', prompt: 'When is a surjection a quotient map?'},
  {id: 'q2', kind: 'mcq', prompt: 'Is every continuous surjection a quotient map?', options: ['Yes', 'No']},
  {id: 'q3', kind: 'msq', prompt: 'Which are always quotient maps?', options: ['Open surjections', 'Closed surjections', 'Constant maps']},
];
describe('quick questionnaire rules', () => {
  it('accepts short, one-choice and several-choice questions and names what is wrong otherwise', () => {
    expect(questionnaireIssues({title: 'Quick check', purpose: 'diagnose', questions})).toEqual([]);
    expect(questionnaireIssues({title: 'Quick check', questions: []})).toContain('questions must be 1 to 10 items');
    expect(questionnaireIssues({title: ' ', questions})).toContain('title must be 1 to 120 characters');
    expect(questionnaireIssues({title: 'x', purpose: 'grade', questions})[0]).toMatch(/^purpose must be one of diagnose/);
    expect(questionnaireIssues({title: 'x', questions: [{id: 'q1', kind: 'mcq', prompt: 'A', options: ['only']}]})[0]).toMatch(/options must be 2 to 8/);
    expect(questionnaireIssues({title: 'x', questions: [{id: 'q1', kind: 'short', prompt: 'A'}, {id: 'q1', kind: 'short', prompt: 'B'}]})[0]).toMatch(/repeated/);
    expect(questionnaireIssues({title: 'x', questions: [{id: 'q1', kind: 'short', prompt: 'A', options: ['a', 'b']}]})[0]).toMatch(/no options/);
    expect(questionnaireIssues({title: 'x', questions: [{id: 'Q 1', kind: 'essay', prompt: 'A'}]})).toHaveLength(2);
    expect(questionnaireIssues({title: 'x', questions, grade: 'A'})).toEqual(['unexpected field grade']);
  });
  it('fits answers to their questions and knows when every question is answered', () => {
    expect(answersFit(questions, {})).toBe(true);
    expect(answersFit(questions, {q1: 'Open sets pull back', q2: 1, q3: [0, 1]})).toBe(true);
    for (const bad of [{q9: 'x'}, {q1: 3}, {q2: 2}, {q2: '1'}, {q3: [0, 0]}, {q3: [5]}, {q1: 'x'.repeat(2001)}, []])
      expect(answersFit(questions, bad)).toBe(false);
    expect(questionnaireComplete(questions, {q1: 'yes', q2: 0})).toBe(false);
    expect(questionnaireComplete(questions, {q1: '  ', q2: 0, q3: [1]})).toBe(false);
    expect(questionnaireComplete(questions, {q1: 'yes', q2: 0, q3: []})).toBe(false);
    expect(questionnaireComplete(questions, {q1: 'yes', q2: 0, q3: [1]})).toBe(true);
  });
});
