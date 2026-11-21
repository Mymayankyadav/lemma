import {useId} from 'react';
import {useToast} from '../../../ui/Toast';
import {Button, Switch} from '../../../ui/v7/components';
import {setWritingAidMode, setWritingAidSurface, useWritingAidPreferences, WRITING_AID_MODES} from './preferences';
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

export function WritingAidSettings({showTitle = true}: {showTitle?: boolean}) {
  const {scopeKey, available, mode, surfaces} = useWritingAidPreferences();
  const personalization = useWritingAidPersonalization();
  const group = useId();
  const notify = useToast();
  const failed = () => notify('Could not save writing aid settings.', {tone: 'danger'});

  return <section className="writing-aid-settings" aria-label="Writing aid settings">
    {showTitle && <h2 className="v7-eyebrow">Writing aid</h2>}
    <p>Suggestions are prepared on this device. Your draft changes when you choose a suggestion.</p>
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
