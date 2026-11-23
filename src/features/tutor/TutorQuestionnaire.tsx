import {useEffect, useId, useRef, useState} from 'react';
import {ClipboardList} from 'lucide-react';
import {Button, Checkbox, IconButton, RadioOption, Sheet} from '../../ui/v7/components';
import {MathText} from '../../ui/MathText';
import {
  answered, questionnaireComplete, type QuestionnaireAnswer, type QuestionnaireAnswers, type QuestionnaireState,
  type TutorQuestionnaire,
} from '../../../supabase/functions/_shared/tutor-questionnaire';
import type {QuestionnaireSave, TutorQuestionnaireApi} from '../../data/tutor/manual-api';

const STATE_LABEL: Record<QuestionnaireState, string> = {unseen: 'not opened', started: 'in progress', complete: 'complete'};
const SAVE_DELAY = 700;

/** The learner's unsaved answers, on this device until the server has them (N228: "nothing is lost"). */
type Edits = Readonly<Record<string, QuestionnaireAnswer | null>>;
type StoredAnswers = {edits: Edits} | {base: number; answers: QuestionnaireAnswers};
export type QuestionnaireBackup = {
  read: (id: string) => StoredAnswers | null;
  write: (id: string, edits: Edits, expected?: StoredAnswers | null) => boolean;
};

function applyEdits(answers: QuestionnaireAnswers, edits: Edits): QuestionnaireAnswers {
  const merged = {...answers};
  for (const [key, value] of Object.entries(edits)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

function sameAnswer(left: QuestionnaireAnswer | null | undefined, right: QuestionnaireAnswer | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function restoreEdits(stored: StoredAnswers | null, questionnaire: TutorQuestionnaire): Edits {
  if (!stored) return {};
  if ('edits' in stored) return stored.edits;
  // Older backups stored a whole snapshot. Only a matching base can identify deleted keys.
  const keys = Object.keys(stored.base === questionnaire.version ? {...questionnaire.answers, ...stored.answers} : stored.answers);
  const edits: Record<string, QuestionnaireAnswer | null> = {};
  for (const key of keys) {
    const local = stored.answers[key] ?? null;
    if (!sameAnswer(local, questionnaire.answers[key])) edits[key] = local;
  }
  return edits;
}

/**
 * N228 (Owner: "the quick questionnaire … the tutor can attach along with chat … show the option of open questionnaire
 * in the reply row and use icon colour to show if the questionnaire is complete, started but not completed, or not
 * seen; maintain data so it can be filled later and nothing is lost"). One button per questionnaire in the reply row;
 * its colour is its state. The sheet saves each change (and keeps it on the device until saved), so the learner can
 * leave and come back; Submit sends it to the tutor once every question has an answer.
 */
export function QuestionnaireButton({questionnaire, api, backup, onChange}: {
  questionnaire: TutorQuestionnaire; api: TutorQuestionnaireApi; backup: QuestionnaireBackup;
  onChange: (next: TutorQuestionnaire) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = 'Open questionnaire: ' + questionnaire.title + ' · ' + STATE_LABEL[questionnaire.state];
  return <>
    <IconButton label={label} title={label} data-questionnaire={questionnaire.state} onClick={() => setOpen(true)}>
      <ClipboardList aria-hidden="true"/>
    </IconButton>
    {open && <QuestionnaireSheet questionnaire={questionnaire} api={api} backup={backup} onChange={onChange} onClose={() => setOpen(false)}/>}
  </>;
}

type Status = 'idle' | 'saving' | 'saved' | 'local' | 'conflict';

function QuestionnaireSheet({questionnaire, api, backup, onChange, onClose}: {
  questionnaire: TutorQuestionnaire; api: TutorQuestionnaireApi; backup: QuestionnaireBackup;
  onChange: (next: TutorQuestionnaire) => void; onClose: () => void;
}) {
  const id = questionnaire.id, name = useId();
  const [initial] = useState(() => {
    const stored = backup.read(id);
    return {stored, edits: restoreEdits(stored, questionnaire)};
  });
  const stored = useRef(initial.stored);
  const server = useRef(questionnaire);
  const [edits, setEdits] = useState(initial.edits);
  const latest = useRef(initial.edits);
  const [status, setStatus] = useState<Status>(Object.keys(initial.edits).length ? 'local' : 'idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const saveAgain = useRef(false);
  const current = questionnaire.version > server.current.version ? questionnaire : server.current;
  const submitted = current.state === 'complete';
  const answers = applyEdits(current.answers, edits);

  function keep(next: Edits, acknowledged = false) {
    latest.current = next;
    setEdits(next);
    if (backup.write(id, next, acknowledged ? stored.current : undefined)) {
      stored.current = Object.keys(next).length ? {edits: next} : null;
    }
  }

  function adopt(next: TutorQuestionnaire) {
    if (next.version >= server.current.version) {
      server.current = next;
      onChange(next);
    }
  }

  async function write(sent: Edits, submit: boolean) {
    const keys = Object.keys(sent);
    const send = (base: TutorQuestionnaire, answers: QuestionnaireAnswers) =>
      api.save(id, base.version, keys.length || submit ? answers : null, submit);
    try {
      const base = server.current;
      let result: QuestionnaireSave = await send(base, applyEdits(base.answers, sent));
      if (result.status === 'conflict') {
        const base = result.questionnaire;
        adopt(base);
        const merged = applyEdits(base.answers, sent);
        if (!submit || questionnaireComplete(base.questions, merged)) result = await send(base, merged);
      }
      adopt(result.questionnaire);
      if (result.status === 'conflict') {setStatus('conflict'); return;}
      const pending = {...latest.current};
      for (const key of keys) {
        if (pending[key] === sent[key] && sameAnswer(sent[key], result.questionnaire.answers[key])) delete pending[key];
      }
      if (Object.keys(pending).length < Object.keys(latest.current).length) keep(pending, true);
      setStatus(Object.keys(pending).length ? 'local' : 'saved');
    } catch (cause) {
      setStatus(Object.keys(latest.current).length ? 'local' : 'idle');
      setError(cause instanceof Error ? cause.message : 'Your answers were not saved yet.');
    }
  }

  // Timers and a close event can arrive during a save. Let the current write finish before sending newer edits.
  function save(submit = false): Promise<void> {
    window.clearTimeout(timer.current);
    if (inFlight.current) {
      saveAgain.current = true;
      return inFlight.current;
    }
    if (server.current.state === 'complete' || (!submit && !Object.keys(latest.current).length && server.current.state !== 'unseen')) return Promise.resolve();
    setStatus('saving');
    setSubmitting(submit);
    setError('');
    inFlight.current = write(latest.current, submit).finally(() => {
      inFlight.current = undefined;
      setSubmitting(false);
      if (saveAgain.current) {
        saveAgain.current = false;
        scheduleSave();
      }
    });
    return inFlight.current;
  }
  function scheduleSave() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
  }

  useEffect(() => {
    if (questionnaire.version > server.current.version) server.current = questionnaire;
  }, [questionnaire]);

  useEffect(() => {
    // Opening marks it seen; the tutor can tell "not opened" from "started".
    if (current.state === 'unseen') void save();
    else if (!submitted && Object.keys(initial.edits).length) scheduleSave();
    return () => {window.clearTimeout(timer.current); saveAgain.current = false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function answer(question: string, value: QuestionnaireAnswer | undefined) {
    keep({...latest.current, [question]: value ?? null});
    if (!inFlight.current) setStatus('local');
    scheduleSave();
  }
  async function close() {
    await inFlight.current;
    if (Object.keys(latest.current).length) await save();
    onClose();
  }
  const complete = questionnaireComplete(questionnaire.questions, answers);
  const remaining = questionnaire.questions.filter(question => !answered(question, answers)).length;
  const unsent = submitted && Object.entries(edits).some(([key, value]) => !sameAnswer(value, current.answers[key]));
  const note = submitted ? (unsent ? 'Already submitted. Your unsent edits are shown here and kept on this device.' : 'Submitted. Your tutor can read your answers.')
    : status === 'saving' ? 'Saving…'
    : status === 'saved' ? 'Saved. You can come back to it later.'
    : status === 'local' ? (error ? error + ' They are kept on this device.' : 'Kept on this device; saving…')
    : status === 'conflict' ? 'Answered on another device too. Check your answers and submit again.'
    : 'Answers save as you go. You can come back to it later.';

  return <Sheet open onClose={() => void close()} title={questionnaire.title}>
    <form className="tutor-questionnaire" onSubmit={event => {event.preventDefault(); if (complete && !submitted) void save(true);}}>
      <p className="tutor-questionnaire-note" role="status">{note}</p>
      <ol>
        {questionnaire.questions.map((question, at) => {
          const value = answers[question.id];
          return <li key={question.id}>
            <fieldset disabled={submitted || submitting}>
              <legend><span className="v7-sr-only">Question {at + 1}: </span><MathText source={question.prompt}/></legend>
              {question.kind === 'short' && <textarea className="v7-field" rows={2} maxLength={2000} aria-label={'Answer to question ' + (at + 1)}
                value={typeof value === 'string' ? value : ''} onChange={event => answer(question.id, event.target.value || undefined)}/>}
              {question.kind === 'mcq' && question.options.map((option, index) => <RadioOption key={index} name={name + question.id}
                label={option} checked={value === index} onChange={() => answer(question.id, index)}/>)}
              {question.kind === 'msq' && <>
                <small>Choose all that apply.</small>
                {question.options.map((option, index) => {
                  const chosen = Array.isArray(value) ? value : [];
                  return <Checkbox key={index} label={option} checked={chosen.includes(index)} onChange={on => {
                    const next = on ? [...chosen, index].sort((a, b) => a - b) : chosen.filter(item => item !== index);
                    answer(question.id, next.length ? next : undefined);
                  }}/>;
                })}
              </>}
            </fieldset>
          </li>;
        })}
      </ol>
      {!submitted && <div className="tutor-questionnaire-actions">
        <Button variant="primary" type="submit" disabled={!complete || status === 'saving'}>Submit answers</Button>
        {!complete && <small>{remaining === 1 ? '1 question left' : remaining + ' questions left'}</small>}
      </div>}
    </form>
  </Sheet>;
}
