import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import type {SavedTutorTurn} from '../../data/tutor/manual-api';
import {MathText} from '../../ui/MathText';
import {Tex} from '../../ui/Tex';
import {Sheet} from '../../ui/v7/components';
import {TutorComposer} from './TutorComposer';
import {TutorLayout, TutorOverview, type TutorPageContext} from './TutorLayout';

export type SendOptions = {includeObjective?: boolean; keepDraft?: boolean};
const hints = [
  'Hint 1 of 4. Give me a small nudge on the current question.',
  'Hint 2 of 4. Which definition or result should I use next?',
  'Hint 3 of 4. Help me set up the next step and let me finish it.',
  'Hint 4 of 4. Show me the missing step, then ask me to explain it in my own words.',
];

type Props = {
  page: TutorPageContext;
  turns: readonly SavedTutorTurn[];
  draft: string;
  onChange: (text: string) => void;
  onSend: (text: string, options?: SendOptions) => Promise<void>;
  canSend: boolean;
  readOnly: boolean;
  pending: boolean;
  offline: boolean;
  draftUnsaved: boolean;
  hasContext: boolean;
  status: ReactNode;
  pendingStatus: ReactNode;
  context: ReactNode;
  connection: ReactNode;
  transcript: ReactNode;
};

// Tutors usually end their feedback with the next question. Pin that paragraph.
function questionPreview(body: string) {
  const paragraphs = body.trim().split(/\n\s*\n/);
  return (paragraphs.filter(p => p.includes('?')).at(-1) || paragraphs.at(-1) || '').trim();
}

export function TutorChat({page, turns, draft, onChange, onSend, canSend, readOnly, pending, offline,
  status, pendingStatus, context, connection, transcript, hasContext, draftUnsaved}: Props) {
  const [view, setView] = useState<'overview' | 'chat'>();
  const [panel, setPanel] = useState<'context' | 'connection' | 'close'>();
  const chat = useRef<HTMLDivElement>(null), follow = useRef(true);
  const previousHeight = useRef(0), previousFirst = useRef<string | undefined>(undefined);
  const last = turns.at(-1), first = turns.at(0)?.id;
  const hintIndex = Math.min(hints.length - 1, hints.indexOf(last?.snapshot.question ?? '') + 1);
  const overview = (view ?? (last || draft ? 'chat' : 'overview')) === 'overview';
  const latestReply = turns.filter(turn => turn.status === 'completed').at(-1);
  const pinned = latestReply?.status === 'completed' ? questionPreview(latestReply.finalReply.body) : '';
  const step = page.detail.steps[page.detail.view.currentStep] || page.detail.objective;
  useLayoutEffect(() => {
    const element = chat.current;
    if (!element || overview) return;
    if (previousFirst.current && first !== previousFirst.current) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
    } else if (follow.current) {
      element.scrollTop = element.scrollHeight;
    }
    previousHeight.current = element.scrollHeight;
    previousFirst.current = first;
  }, [first, last?.id, last?.version, overview]);
  function send(text: string, options?: SendOptions) {
    follow.current = true;
    setView('chat');
    void onSend(text, options);
  }
  const openConnection = () => setPanel('connection');
  return <TutorLayout page={page} sequence={latestReply?.sequence ?? 0} offline={offline}
    onOverview={() => setView('overview')} onCloseSession={() => setPanel('close')} onConnection={openConnection}>
    {!overview && pinned && <div className="ontable">
      <span className="ot-l">On the table</span><span className="ot-q" inert><b>Q{latestReply?.sequence}</b> · <Tex source={pinned}/></span>
      <button className="pinned-question" aria-label="The question on the table" aria-description={pinned}
        onClick={() => chat.current?.querySelector('[data-latest-reply]')?.scrollIntoView({block:'start'})}>
        <span className="sr">{pinned}</span>
      </button>
    </div>}
    <div className="chat" ref={chat} role="log" aria-label="Conversation" aria-live="polite"
      onScroll={event => {const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;}}>
      {status}
      {overview ? <TutorOverview page={page} busy={!last && !canSend} hasTurns={!!last}
        onContinue={() => setView('chat')}
        onWrite={!first && !readOnly ? () => setView('chat') : undefined}
        onBegin={() => send('Let’s study ' + page.detail.view.title + '. Start with one short question to check what I understand.', {includeObjective:true, keepDraft:true})}/>
        : <>
          {!first && !readOnly && <div className="turn"><div className="msg a">
            <h3 className="who">{page.detail.view.code} · {page.detail.view.title}</h3>
            <div className="bd"><MathText source={step || page.detail.view.title}/></div>
          </div></div>}
          {transcript}
          {pending && <div className="tutor-message-status" role="status">
            {pendingStatus}
            <button className="btn small ghost" onClick={openConnection}>Tutor connection</button>
          </div>}
        </>}
    </div>
    {!overview && <>
      {draftUnsaved && <p className="composer-status" role="alert">This draft could not be saved on this device.</p>}
      <TutorComposer value={draft} onChange={onChange} onSend={send} canSend={canSend}
        hintLevel={hintIndex + 1}
        onAsk={kind => {
          const request = kind === 'hint' ? hints[hintIndex] : kind === 'stuck' ?
            'I’m stuck on the current question. Can you ask me a smaller question to get started?' :
            'Which symbols or proof phrases would help me write my answer to the current question?';
          send(request, {keepDraft:true});
        }}
        notationContext={[page.detail.view.title, step, pinned]} readOnly={readOnly} pending={pending} hasContext={hasContext}
        onContext={() => setPanel('context')} onConnection={openConnection}/>
    </>}
    <Sheet open={panel === 'context'} title="Context for your tutor" onClose={() => setPanel(undefined)}>
      {panel === 'context' && context}
    </Sheet>
    <Sheet open={panel === 'connection'} title="Tutor connection" onClose={() => setPanel(undefined)}>
      {panel === 'connection' && connection}
    </Sheet>
    <Sheet open={panel === 'close'} title="Close the session" onClose={() => setPanel(undefined)}>
      <p>Ask your tutor for three recall questions and a summary of this session.</p>
      <button className="v7-button v7-primary" disabled={!canSend} onClick={() => {
        setPanel(undefined);
        send('Let’s close this session. Ask me three short recall questions, one at a time, then summarize what I demonstrated and what to revisit.', {keepDraft:true});
      }}>Start recall</button>
    </Sheet>
  </TutorLayout>;
}
