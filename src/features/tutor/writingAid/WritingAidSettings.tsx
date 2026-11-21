import {useId} from 'react';
import {useToast} from '../../../ui/Toast';
import {Button, Switch} from '../../../ui/v7/components';
import {setTutorHints, setWritingAidAutoCorrection, setWritingAidMode, setWritingAidSurface, useWritingAidPreferences,
  TUTOR_HINTS_MODES, WRITING_AID_MODES, type TutorHintsMode} from './preferences';
import {resetWritingAidPersonalization, setWritingAidPersonalization, useWritingAidPersonalization} from './personalization';
import type {WritingAidMode, WritingAidSurface} from './policy';
import './writingAidSettings.css';

const MODE_LABELS: Record<WritingAidMode, {label: string; hint: string}> = {
  balanced: {label: 'Balanced', hint: 'Word endings, visible edits and short continuations.'},
  fast: {label: 'Faster typing', hint: 'Experimental. Earlier word suggestions can steer your mathematical wording.'},
  strict: {label: 'Strict', hint: 'Exact notation and typed spelling only.'},
  off: {label: 'Off', hint: 'Type with the regular and math keyboards.'},
};

const SURFACE_LABELS: ReadonlyArray<readonly [WritingAidSurface, string]> = [
  ['words', 'Keyboard word suggestions'],
  ['replace', 'Notation replacements'],
  ['correction', 'Spelling corrections'],
  ['ghost', 'Faded continuations'],
];

const TUTOR_HINTS_LABELS: Record<TutorHintsMode, {label: string; hint: string}> = {
  wording: {label: 'Wording', hint: 'Use matching wording from the current tutor reply.'},
  all: {label: 'Wording and notation', hint: 'Experimental. Also use matching terms and notation from the tutor.'},
  off: {label: 'Off', hint: 'Use writing assistance without tutor suggestions.'},
};

export function WritingAidSettings({showTitle = true}: {showTitle?: boolean}) {
  const {scopeKey, available, mode, surfaces, autoCorrection, tutorHints} = useWritingAidPreferences();
  const personalization = useWritingAidPersonalization();
  const group = useId();
  const notify = useToast();
  const failed = () => notify('Could not save writing aid settings.', {tone: 'danger'});

  return <section className="writing-aid-settings" aria-label="Writing aid settings">
    {showTitle && <h2 className="v7-eyebrow">Writing aid</h2>}
    <p>Suggestions are prepared on this device. You can undo automatic corrections.</p>
    <fieldset disabled={!available}>
      <legend>Suggestion mode</legend>
      {WRITING_AID_MODES.map(value => {
        const {label, hint} = MODE_LABELS[value];
        const hintId = group + '-' + value;
        return <label className="writing-aid-mode" key={value}>
          <input type="radio" name={group} checked={mode === value} aria-describedby={hintId}
            onChange={() => {if (!setWritingAidMode(value, scopeKey)) failed();}}/>
          <span><strong>{label}</strong><small id={hintId}>{hint}</small></span>
        </label>;
      })}
    </fieldset>
    <fieldset disabled={!available || mode === 'off'}>
      <legend>Tutor hints</legend>
      {TUTOR_HINTS_MODES.map(value => {
        const {label, hint} = TUTOR_HINTS_LABELS[value];
        const hintId = group + '-tutor-' + value;
        return <label className="writing-aid-mode" key={value}>
          <input type="radio" name={group + '-tutor'} checked={tutorHints === value} aria-label={label} aria-describedby={hintId}
            onChange={() => {if (!setTutorHints(value, scopeKey)) failed();}}/>
          <span><strong>{label}</strong><small id={hintId}>{hint}</small></span>
        </label>;
      })}
    </fieldset>
    {mode !== 'off' && <fieldset disabled={!available}>
      <legend>Automatic correction</legend>
      <p>Experimental: after you accept the same correction twice, that typo may be corrected as you type. Undo restores your wording. This trial was evaluated with synthetic examples.</p>
      <Switch label="Correct common typos automatically" checked={autoCorrection} disabled={!available}
        onChange={next => {if (!setWritingAidAutoCorrection(next, scopeKey)) failed();}}/>
    </fieldset>}
    <fieldset disabled={!available || mode === 'off'}>
      <legend>Suggestions to show</legend>
      {SURFACE_LABELS.map(([surface, label]) => {
        const enabled = available && mode !== 'off' && (mode !== 'strict' || surface !== 'ghost');
        return <Switch key={surface} label={label} checked={enabled && surfaces[surface]} disabled={!enabled}
          onChange={next => {if (!setWritingAidSurface(surface, next, scopeKey)) failed();}}/>;
      })}
    </fieldset>
    <fieldset disabled={!available}>
      <legend>Personalization</legend>
      <p>Learn from your choices and repeated typing on this device.</p>
      <Switch label="Personalize suggestions" checked={personalization.enabled} disabled={!available}
        onChange={next => {if (!setWritingAidPersonalization(next, scopeKey)) failed();}}/>
      <Button small variant="secondary" onClick={() => {
        if (!resetWritingAidPersonalization(scopeKey)) failed();
        else notify('Learned writing preferences cleared.');
      }}>Forget learned writing preferences</Button>
    </fieldset>
  </section>;
}
