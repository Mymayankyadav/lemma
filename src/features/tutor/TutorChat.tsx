import {BackToStudy,type TutorExamPanel} from '../exam/TutorExamTools';
import {authGeneration,authOwner} from '../../data/authBoundary';
import {getDemoProfile,getMode} from '../../data/mode';
import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {Copy, Trash2, X} from 'lucide-react';
import {tutorMessageKey, type SavedTutorTurn, type TutorMessageRef} from '../../data/tutor/manual-api';
import {MathText} from '../../ui/MathText';
import {Button, IconButton, Sheet} from '../../ui/v7/components';
import {useToast} from '../../ui/Toast';
import type {TutorInkState} from './TutorInk';
import {referencedImageIds} from '../../../supabase/functions/_shared/tutor-answer';
import {TutorComposer} from './TutorComposer';
import {TutorLayout, TutorOverview, type TutorPageContext} from './TutorLayout';
import {TutorSelection, type TutorSelectedMessage} from './TutorMessageSelection';

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
  timedLabel?:string;
  onDeleteMessages?: (messages: readonly TutorMessageRef[]) => Promise<void>;
};

// Tutors usually end their feedback with the next question. Use it as notation context.
function questionPreview(body: string) {
  const paragraphs = body.trim().split(/\n\s*\n/);
  return (paragraphs.filter(p => p.includes('?')).at(-1) || paragraphs.at(-1) || '').trim();
}

export function TutorChat({page, turns, draft, onChange, onSend, canSend, readOnly, pending, offline,
  status, pendingStatus, context, connection, transcript, hasContext, draftWarning, listenerSeenAt, resumePrompt, ink, canQueueImage, onDeleteMessages,timedLabel}: Props) {
  const [examPanel,setExamPanel]=useState<TutorExamPanel>();
  const [view, setView] = useState<'overview' | 'chat'>();
  const [panel, setPanel] = useState<'context' | 'connection' | 'close' | 'question'>();
  const [headerHidden, setHeaderHidden] = useState(false);
  const [sessionActionsOpen, setSessionActionsOpen] = useState(false);
  const [answerActions, setAnswerActions] = useState<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<ReadonlyMap<string, TutorSelectedMessage>>(() => new Map());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const selecting = selected.size > 0;
  const notify = useToast();
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
  const overview = (view ?? (last || draft || hasInk || page.exam ? 'chat' : 'overview')) === 'overview';
  const latestCompleted = turns.filter(turn => turn.status === 'completed').at(-1);
  const latestReply = latestCompleted?.replyDeleted ? undefined : latestCompleted;
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
  useEffect(() => {
    if (!selecting || confirmDelete) return;
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) setSelected(new Map());
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [selecting, confirmDelete]);
  function select(entry: TutorSelectedMessage, toggle?: boolean) {
    const key = tutorMessageKey(entry.message);
    if (!selected.has(key) && selected.size >= 100) {
      notify('Select up to 100 messages at a time.');
      return;
    }
    follow.current = false;
    if (document.activeElement?.matches('textarea,[contenteditable=true]')) (document.activeElement as HTMLElement).blur();
    setSelected(current => {
      const next = new Map(current);
      if (toggle && next.has(key)) next.delete(key);
      else next.set(key, entry);
      return next;
    });
  }
  function selectedInConversationOrder() {
    const entries: TutorSelectedMessage[] = [];
    for (const node of chat.current?.querySelectorAll<HTMLElement>('[data-tutor-message]') ?? []) {
      const entry = selected.get(node.dataset.tutorMessage ?? '');
      if (entry) entries.push(entry);
    }
    return entries;
  }
  async function copyMessages() {
    const messages = selectedInConversationOrder();
    if (!messages.length) return;
    try {
      await navigator.clipboard.writeText(messages.map(entry => entry.text).join('\n\n'));
      setSelected(new Map());
      notify(messages.length === 1 ? 'Message copied.' : 'Messages copied.');
    } catch {notify('Could not copy the selected messages.');}
  }
  async function deleteMessages() {
    if (!onDeleteMessages || deleting) return;
    const messages = selectedInConversationOrder();
    if (!messages.length) {
      setConfirmDelete(false);
      setSelected(new Map());
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteMessages(messages.map(entry => entry.message));
      setConfirmDelete(false);
      setSelected(new Map());
      notify(messages.length === 1 ? 'Message deleted.' : 'Messages deleted.');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the selected messages. Try again.');
    } finally {setDeleting(false);}
  }
  function send(text: string, options?: SendOptions) {
    follow.current = true;
    setView('chat');
    void onSend(text, options);
  }
  const openConnection = () => setPanel('connection');
  const hideHeader = !overview && headerHidden;
  return <TutorLayout page={page} sequence={latestCompleted?.sequence ?? 0} offline={offline} overview={overview} headerHidden={hideHeader} listenerSeenAt={listenerSeenAt} resumePrompt={resumePrompt}
    onContext={overview?()=>setPanel('context'):undefined} claimExpiresAt={last?.status==='awaiting-tutor'?last.claimExpiresAt:undefined}
    examPanel={examPanel} onExamPanel={setExamPanel}
    sessionActionsOpen={sessionActionsOpen} onSessionActions={setSessionActionsOpen} answerActions={setAnswerActions}
    onOverview={!overview ? () => {setSelected(new Map()); setView('overview');} : undefined}
    onQuestion={!overview && question ? () => {
      const element = chat.current;
      const reply = element?.querySelector<HTMLElement>('[data-latest-reply]');
      if (element && reply) element.scrollTop += reply.getBoundingClientRect().top - element.getBoundingClientRect().top;
    } : undefined}
    onCloseSession={() => setPanel('close')} onConnection={openConnection}>
    {!overview && question && <button className="tutor-pinned" type="button" aria-haspopup="dialog" inert={hideHeader} onClick={()=>setPanel('question')}>
      <span>On the table</span><strong>{question}</strong>
    </button>}
    <div className="chat" ref={chat} role="log" aria-label="Conversation" aria-live={selecting ? 'off' : 'polite'} data-selecting={selecting || undefined}
      onScroll={event => {const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;}}>
      {status}
      {overview ? <TutorOverview page={page} busy={!last && !canSend} hasTurns={!!last}
        onContinue={() => setView('chat')}
        onWrite={!first && !readOnly ? () => setView('chat') : undefined}
        onBegin={() => send('Let’s study ' + page.detail.view.title + '. Start with one short question to check what I understand.', {includeObjective:true, keepDraft:true})}/>
        : <>
          {!first && !readOnly && <div className="turn"><div className="msg a">
            <div className="bd"><MathText source={step || page.detail.view.title}/></div>
          </div></div>}
          <TutorSelection.Provider value={{selected, select}}>{transcript}</TutorSelection.Provider>
          {pending && <div className="tutor-message-status" role="status">
            {pendingStatus}
          </div>}
        </>}
    </div>
    {panel !== 'context' && draftWarning && <p className="composer-status" role="alert">{draftWarning}</p>}
    {!overview&&page.exam&&<div className="v7-exam-actions v7-exam-composer-actions" aria-label="Exam actions">
     {timedLabel&&<span className="v7-exam-chip" aria-live="off">{timedLabel}</span>}
     <Button small disabled={!canSend||readOnly} onClick={()=>send('Give me the next hint for this question.',{keepDraft:true})}>Hint</Button>
     <Button small disabled={!canSend||readOnly} onClick={()=>send('Skip this item and record it as unknown. Give me the next question.',{keepDraft:true})}>Skip</Button>
     {page.exam.status!=='finished'&&<>
      <Button small disabled={offline} onClick={()=>setExamPanel('budget')}>I have {page.exam.study_minutes??0} min</Button>
      <BackToStudy project={page.project} sitting={page.exam}/>
     </>}
    </div>}
    {!overview &&
      <TutorComposer inputScopeKey={inputScopeKey} ink={ink} canQueueImage={canQueueImage} value={draft} onChange={onChange} onSend={send} canSend={canSend} suspended={selecting}
        headerHidden={hideHeader} onToggleHeader={()=>setHeaderHidden(hidden=>!hidden)}
        sessionActionsOpen={sessionActionsOpen} onCloseActions={()=>setSessionActionsOpen(false)} answerActions={answerActions}
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
    {!overview && selecting && <div className="tutor-selection-bar" role="group" aria-label="Selected messages">
      <IconButton label="Exit message selection" onClick={() => setSelected(new Map())}><X aria-hidden="true"/></IconButton>
      <span className="tutor-selection-count" role="status">{selected.size} selected</span>
      <Button variant="ghost" onClick={() => void copyMessages()}><Copy aria-hidden="true"/>Copy</Button>
      {onDeleteMessages && <Button variant="ghost" destructive disabled={readOnly || offline} onClick={() => {
        setDeleteError(''); setConfirmDelete(true);
      }}><Trash2 aria-hidden="true"/>Delete</Button>}
    </div>}
    <Sheet open={confirmDelete} title={selected.size === 1 ? 'Delete this message?' : 'Delete selected messages?'}
      onClose={() => {if (!deleting) setConfirmDelete(false);}}>
      <p>{selected.size === 1 ? 'This message will be removed from the conversation.' : `${selected.size} messages will be removed from the conversation.`}</p>
      {deleteError && <p role="alert">{deleteError}</p>}
      <div className="tutor-selection-confirm">
        <Button disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button variant="primary" destructive disabled={offline || !onDeleteMessages} loading={deleting} onClick={() => void deleteMessages()}>Delete</Button>
      </div>
    </Sheet>
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
