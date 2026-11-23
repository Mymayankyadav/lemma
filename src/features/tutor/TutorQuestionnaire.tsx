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
export type QuestionnaireBackup = {
  read: (id: string) => {base: number; answers: QuestionnaireAnswers} | null;
  write: (id: string, base: number, answers: QuestionnaireAnswers) => void;
  clear: (id: string) => void;
};

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

type Status = 'idle' | 'saving' | 'saved' | 'local' | 'conflict' | 'error';

function QuestionnaireSheet({questionnaire, api, backup, onChange, onClose}: {
  questionnaire: TutorQuestionnaire; api: TutorQuestionnaireApi; backup: QuestionnaireBackup;
  onChange: (next: TutorQuestionnaire) => void; onClose: () => void;
}) {
  const id = questionnaire.id, name = useId();
  const restored = (() => {
    const kept = backup.read(id);
    return kept && kept.base === questionnaire.version && questionnaire.state !== 'complete' ? kept.answers : null;
  })();
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(restored ?? questionnaire.answers);
  const [status, setStatus] = useState<Status>(restored ? 'local' : 'idle');
  const [error, setError] = useState('');
  const server = useRef(questionnaire);
  /** Questions changed here since the last save, so a copy saved elsewhere keeps its other answers. */
  const edited = useRef(new Set<string>(restored ? Object.keys(restored) : []));
  const latest = useRef(answers);
  const timer = useRef<number | undefined>(undefined);
  const submitted = server.current.state === 'complete';

  function adopt(result: QuestionnaireSave) {
    server.current = result.questionnaire;
    onChange(result.questionnaire);
  }
  async function save(submit = false): Promise<boolean> {
    window.clearTimeout(timer.current);
    if (server.current.state === 'complete') return true;
    const keys = new Set(edited.current);
    let sent = latest.current;
    setStatus('saving'); setError('');
    try {
      let result = await api.save(id, server.current.version, sent, submit);
      if (result.status === 'conflict') {
        // Saved from another device meanwhile: keep its answers, and this device's changes on top.
        const merged = {...result.questionnaire.answers} as Record<string, QuestionnaireAnswer>;
        for (const key of keys) if (key in sent) merged[key] = sent[key]; else delete merged[key];
        adopt(result);
        if (latest.current === sent) {latest.current = merged; setAnswers(merged);}
        sent = merged;
        result = await api.save(id, result.questionnaire.version, merged, submit);
      }
      adopt(result);
      if (result.status === 'conflict') {setStatus('conflict'); return false;}
      if (result.status === 'submitted') {
        latest.current = result.questionnaire.answers;
        setAnswers(result.questionnaire.answers);
      }
      for (const key of keys) if (latest.current[key] === sent[key]) edited.current.delete(key);
      if (latest.current === sent || result.status === 'submitted') backup.clear(id);
      else backup.write(id, result.questionnaire.version, latest.current);
      setStatus('saved');
      return true;
    } catch (cause) {
      backup.write(id, server.current.version, latest.current);
      setStatus('local');
      setError(cause instanceof Error ? cause.message : 'Your answers were not saved yet.');
      return false;
    }
  }

  useEffect(() => {
    // Opening marks it seen; the tutor can tell "not opened" from "started".
    if (questionnaire.state === 'unseen') void api.save(id, 0, null, false).then(adopt, () => undefined);
    if (restored) timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function answer(question: string, value: QuestionnaireAnswer | undefined) {
    const next = {...latest.current} as Record<string, QuestionnaireAnswer>;
    if (value === undefined) delete next[question]; else next[question] = value;
    latest.current = next;
    edited.current.add(question);
    setAnswers(next);
    backup.write(id, server.current.version, next);
    setStatus('local');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
  }
  async function close() {
    if (edited.current.size && !submitted) await save();
    onClose();
  }
  const complete = questionnaireComplete(questionnaire.questions, answers);
  const remaining = questionnaire.questions.filter(question => !answered(question, answers)).length;
  const note = submitted ? 'Submitted. Your tutor can read your answers.'
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
            <fieldset disabled={submitted}>
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
