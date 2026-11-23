import {useAutoHideHeader} from './useAutoHideHeader';
import {authGeneration,authOwner} from '../../data/authBoundary';
import {getDemoProfile,getMode} from '../../data/mode';
import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import type {SavedTutorTurn} from '../../data/tutor/manual-api';
import {MathText} from '../../ui/MathText';
import {Button, Sheet} from '../../ui/v7/components';
import type {TutorInkState} from './TutorInk';
import {referencedImageIds} from '../../../supabase/functions/_shared/tutor-answer';
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
  draftWarning?: string;
  hasContext: boolean;
  status: ReactNode;
  pendingStatus: ReactNode;
  listenerSeenAt?: string | null;
  resumePrompt: string;
  ink?: TutorInkState;
  canQueueImage?: boolean;
  context: ReactNode;
  connection: ReactNode;
  transcript: ReactNode;
};

// Tutors usually end their feedback with the next question. Use it as notation context.
function questionPreview(body: string) {
  const paragraphs = body.trim().split(/\n\s*\n/);
  return (paragraphs.filter(p => p.includes('?')).at(-1) || paragraphs.at(-1) || '').trim();
}

export function TutorChat({page, turns, draft, onChange, onSend, canSend, readOnly, pending, offline,
  status, pendingStatus, context, connection, transcript, hasContext, draftWarning, listenerSeenAt, resumePrompt, ink, canQueueImage}: Props) {
  const [view, setView] = useState<'overview' | 'chat'>();
  const [panel, setPanel] = useState<'context' | 'connection' | 'close' | 'question'>();
  const chat = useRef<HTMLDivElement>(null), follow = useRef(true);
  const previousHeight = useRef(0), previousFirst = useRef<string | undefined>(undefined);
  const previousReply = useRef<string | undefined>(undefined);
  const last = turns.at(-1), first = turns.at(0)?.id;
  const inputScopeKey=JSON.stringify([getMode()==='live'?authOwner():getDemoProfile(),authGeneration(),page.detail.view.id,last?.threadId??'']);
  const hintIndex = Math.min(hints.length - 1, hints.indexOf(last?.snapshot.question ?? '') + 1);
  const inkDraft=ink?.draft;
  const refs=inkDraft?.inlineImages?new Set(referencedImageIds(draft)):undefined;
  const hasInk=Boolean(inkDraft?.strokes.length||inkDraft?.queuedText!==undefined||
    (refs?inkDraft?.photos.some(image=>refs.has(image.id))||inkDraft?.editingDrawing&&refs.has(inkDraft.editingDrawing.id)
      :inkDraft?.photos.length));
  const overview = (view ?? (last || draft || hasInk ? 'chat' : 'overview')) === 'overview';
  const latestReply = turns.filter(turn => turn.status === 'completed').at(-1);
  const question = latestReply?.status === 'completed' ? latestReply.finalReply.nextQuestion || questionPreview(latestReply.finalReply.body) : '';
  const step = page.detail.steps[page.detail.view.currentStep] || page.detail.objective;
  useLayoutEffect(() => {
    const element = chat.current;
    if (!element || overview) return;
    if (previousFirst.current && first !== previousFirst.current) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
    } else if (follow.current) {
      const reply = latestReply?.id !== previousReply.current
        ? element.querySelector<HTMLElement>('[data-latest-reply]') : null;
      if (reply && reply.offsetHeight > element.clientHeight) {
        follow.current = false;
        element.scrollTop += reply.getBoundingClientRect().top - element.getBoundingClientRect().top;
      } else {
        element.scrollTop = element.scrollHeight;
      }
    }
    previousHeight.current = element.scrollHeight;
    previousFirst.current = first;
    previousReply.current = latestReply?.id;
  }, [first, last?.id, last?.version, latestReply?.id, overview]);
  useLayoutEffect(() => {
    const element = chat.current;
    if (!element || overview || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (follow.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [overview]);
  function send(text: string, options?: SendOptions) {
    follow.current = true;
    setView('chat');
    void onSend(text, options);
  }
  const openConnection = () => setPanel('connection');
  const headerHidden = useAutoHideHeader(chat, !overview);
  return <TutorLayout page={page} sequence={latestReply?.sequence ?? 0} offline={offline} overview={overview} headerHidden={headerHidden} listenerSeenAt={listenerSeenAt} resumePrompt={resumePrompt}
    onContext={()=>setPanel('context')} claimExpiresAt={last?.status==='awaiting-tutor'?last.claimExpiresAt:undefined}
    onOverview={!overview ? () => setView('overview') : undefined}
    onQuestion={!overview && question ? () => {
      const element = chat.current;
      const reply = element?.querySelector<HTMLElement>('[data-latest-reply]');
      if (element && reply) element.scrollTop += reply.getBoundingClientRect().top - element.getBoundingClientRect().top;
    } : undefined}
    onCloseSession={() => setPanel('close')} onConnection={openConnection}>
    {!overview && question && <button className="tutor-pinned" type="button" aria-haspopup="dialog" inert={headerHidden} onClick={()=>setPanel('question')}>
      <span>On the table</span><strong>{question}</strong>
    </button>}
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
          </div>}
        </>}
    </div>
    {panel !== 'context' && draftWarning && <p className="composer-status" role="alert">{draftWarning}</p>}
    {!overview &&
      <TutorComposer inputScopeKey={inputScopeKey} ink={ink} canQueueImage={canQueueImage} value={draft} onChange={onChange} onSend={send} canSend={canSend}
        hintLevel={hintIndex + 1}
        onAsk={kind => {
          const request = kind === 'hint' ? hints[hintIndex] : kind === 'stuck' ?
            'I’m stuck on the current question. Can you ask me a smaller question to get started?' :
            'Which symbols or proof phrases would help me write my answer to the current question?';
          send(request, {keepDraft:true});
        }}
        notationContext={[page.detail.view.title, step, question]} readOnly={readOnly} pending={pending} hasContext={hasContext}
        onContext={() => setPanel('context')}/>
    }
    <Sheet open={panel === 'question'} title="On the table" onClose={() => setPanel(undefined)}>
      {panel==='question'&&<MathText source={question}/>}
    </Sheet>
    <Sheet open={panel === 'context'} title="Context for your tutor" onClose={() => setPanel(undefined)}
      footer={panel === 'context' && draftWarning && <p role="alert">{draftWarning}</p>}>
      {panel === 'context' && context}
    </Sheet>
    <Sheet open={panel === 'connection'} title="Connection" onClose={() => setPanel(undefined)}>
      {panel === 'connection' && connection}
    </Sheet>
    <Sheet open={panel === 'close'} title="Close the session" onClose={() => setPanel(undefined)}>
      <p>Ask your tutor for three recall questions and a summary of this session.</p>
      <Button variant="primary" disabled={!canSend} onClick={() => {
        setPanel(undefined);
        send('Let’s close this session. Ask me three short recall questions, one at a time, then summarize what I demonstrated and what to revisit.', {keepDraft:true});
      }}>Start recall</Button>
    </Sheet>
  </TutorLayout>;
}
