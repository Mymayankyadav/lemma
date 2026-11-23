/**
 * N228 (Owner): a quick questionnaire the tutor attaches to its reply: short answers, one choice (mcq) or several
 * choices (msq). These checks mirror the database's (tutor_questionnaire_valid, tutor_questionnaire_answers_valid and
 * tutor_questionnaire_complete in 20261218002400_n228_tutor_questionnaires.sql), so the tutor and the learner hear
 * about a problem before Lemma refuses it.
 */
export const QUESTIONNAIRE_PURPOSES = ['diagnose', 'check', 'practice', 'reflect', 'exit'] as const;
export type QuestionnairePurpose = typeof QUESTIONNAIRE_PURPOSES[number];
export type QuestionnaireQuestion =
  | Readonly<{id: string; kind: 'short'; prompt: string}>
  | Readonly<{id: string; kind: 'mcq' | 'msq'; prompt: string; options: readonly string[]}>;
export type QuestionnaireAnswer = string | number | readonly number[];
export type QuestionnaireAnswers = Readonly<Record<string, QuestionnaireAnswer>>;
/** Unseen: never opened. Started: opened or partly answered. Complete: submitted. */
export type QuestionnaireState = 'unseen' | 'started' | 'complete';
export type TutorQuestionnaire = Readonly<{
  id: string; turnId: string; title: string; purpose: QuestionnairePurpose;
  questions: readonly QuestionnaireQuestion[]; state: QuestionnaireState; answers: QuestionnaireAnswers; version: number;
  createdAt?: string; openedAt?: string | null; updatedAt?: string | null; submittedAt?: string | null;
}>;
export type QuestionnaireDraft = Readonly<{title: string; purpose?: QuestionnairePurpose; questions: readonly QuestionnaireQuestion[]}>;

const text = (value: unknown, max: number) => typeof value === 'string' && value.length >= 1 && value.length <= max && /\S/.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const index = (value: unknown, count: number) => Number.isInteger(value) && (value as number) >= 0 && (value as number) < count;

/** What is wrong with a questionnaire the tutor sent; empty when it is valid. */
export function questionnaireIssues(input: unknown): string[] {
  if (!record(input)) return ['the questionnaire must be an object'];
  const issues: string[] = [];
  for (const key of Object.keys(input)) if (!['title', 'purpose', 'questions'].includes(key)) issues.push('unexpected field ' + key);
  if (!text(input.title, 120)) issues.push('title must be 1 to 120 characters');
  if (input.purpose !== undefined && !QUESTIONNAIRE_PURPOSES.includes(input.purpose as QuestionnairePurpose))
    issues.push('purpose must be one of ' + QUESTIONNAIRE_PURPOSES.join(', '));
  const questions = input.questions;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 10) return [...issues, 'questions must be 1 to 10 items'];
  const ids = new Set<string>();
  questions.forEach((question, at) => {
    const where = 'questions.' + at + ' ';
    if (!record(question)) {issues.push(where + 'must be an object'); return;}
    for (const key of Object.keys(question)) if (!['id', 'kind', 'prompt', 'options'].includes(key)) issues.push(where + 'has unexpected field ' + key);
    if (typeof question.id !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(question.id)) issues.push(where + 'id must be 1 to 24 of a-z, 0-9, _ or -');
    else if (ids.has(question.id)) issues.push(where + 'id ' + question.id + ' is repeated');
    else ids.add(question.id);
    if (!text(question.prompt, 1000)) issues.push(where + 'prompt must be 1 to 1000 characters');
    if (question.kind === 'short') {
      if ('options' in question) issues.push(where + 'short questions have no options');
    } else if (question.kind === 'mcq' || question.kind === 'msq') {
      const options = question.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > 8 || !options.every(option => text(option, 300)))
        issues.push(where + 'options must be 2 to 8 texts of up to 300 characters');
    } else issues.push(where + 'kind must be short, mcq or msq');
  });
  return issues;
}

/** Whether the learner's answers fit the questions (an unanswered question has no key). */
export function answersFit(questions: readonly QuestionnaireQuestion[], answers: unknown): answers is QuestionnaireAnswers {
  if (!record(answers)) return false;
  return Object.entries(answers).every(([id, value]) => {
    const question = questions.find(item => item.id === id);
    if (!question) return false;
    if (question.kind === 'short') return typeof value === 'string' && value.length <= 2000;
    if (question.kind === 'mcq') return index(value, question.options.length);
    return Array.isArray(value) && value.length <= question.options.length && new Set(value).size === value.length
      && value.every(item => index(item, question.options.length));
  });
}

/** Whether every question has an answer: text with a non-space character, a choice, or at least one of several. */
export function answered(question: QuestionnaireQuestion, answers: QuestionnaireAnswers): boolean {
  const value = answers[question.id];
  if (question.kind === 'short') return typeof value === 'string' && /\S/.test(value);
  if (question.kind === 'mcq') return typeof value === 'number';
  return Array.isArray(value) && value.length > 0;
}
export const questionnaireComplete = (questions: readonly QuestionnaireQuestion[], answers: QuestionnaireAnswers) =>
  questions.every(question => answered(question, answers));
