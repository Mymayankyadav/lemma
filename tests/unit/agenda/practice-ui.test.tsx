import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PracticeQuestion} from '../../../src/features/adaptive/PracticeQuestion';
import {openPracticeQuestion,savePracticeResult} from '../../../src/data/adaptive/agenda-api';
import {publishAuth} from '../../../src/data/authBoundary';
import {PracticeScoreRejectedError} from '../../../supabase/functions/_shared/practice/delivery';
vi.mock('../../../src/data/adaptive/agenda-api',()=>({openPracticeQuestion:vi.fn(),savePracticeResult:vi.fn()}));
const projectId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sessionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const delivery={status:'available' as const,question:'Prove the intermediate lemma.',arm:'atlas80',itemId:'item',itemVersion:1,requestId,projectId};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});publishAuth({id:'owner-a'});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  vi.mocked(openPracticeQuestion).mockResolvedValue(delivery);
  vi.mocked(savePracticeResult).mockImplementation(async command=>({status:'ok',operationId:command.operationId,requestId,attemptId:'1',actionNo:1}));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.resetAllMocks();});
async function render(){await act(async()=>root.render(<PracticeQuestion sessions={[{id:sessionId,number:3,project_id:projectId,state:'open'},{id:'another-session',number:4,project_id:'another-project',state:'open'}]}/>));}
async function click(text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;expect(button).toBeTruthy();await act(async()=>button.click());}
async function select(label:string,value:string){const input=host.querySelector<HTMLSelectElement>('select[aria-label="'+label+'"]')!;
  await act(async()=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));});}
async function assess(){await select('Practice result','ok');await select('Practice hints used','0');await select('Practice question familiarity','novel');}

it('does not infer evidence from opening or a partly completed assessment and saves exactly the learner choices',async()=>{
  await render();await click('Open practice question');
  expect(host.textContent).toContain(delivery.question);expect(savePracticeResult).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Session 3');expect(host.textContent).not.toContain('Session 4');
  await click('Save my result');expect(savePracticeResult).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Choose/);
  await assess();await select('Practice study session',sessionId);await click('Save my result');
  expect(savePracticeResult).toHaveBeenCalledWith({operationId:expect.any(String),requestId,learnerConfirmed:true,
    outcome:{result:'ok',hintLevel:0,novelty:'novel',sessionId}});
  expect(host.textContent).toContain('Your practice result is saved.');expect(host.querySelector('form')).toBeNull();
});

it('freezes the score and operation ID after a lost acknowledgement so Retry cannot create or change evidence',async()=>{
  vi.mocked(savePracticeResult).mockRejectedValueOnce(Error('connection lost'));
  await render();await click('Open practice question');await assess();await click('Save my result');
  const first=vi.mocked(savePracticeResult).mock.calls[0][0];
  expect(host.textContent).not.toContain('Your practice result is saved.');
  expect(host.textContent).not.toContain('Next question');
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  await act(async()=>root.render(<PracticeQuestion canOpen={false} sessions={[]}/>));
  expect(host.textContent).toContain(delivery.question);
  await click('Retry save');expect(savePracticeResult).toHaveBeenCalledTimes(2);
  expect(vi.mocked(savePracticeResult).mock.calls[1][0]).toBe(first);expect(host.textContent).toContain('Your practice result is saved.');
});

it('opens a fresh next question only after a confirmed save, resets the assessment, and respects release availability',async()=>{
  vi.mocked(openPracticeQuestion).mockImplementation(async id=>({...delivery,requestId:id}));
  vi.mocked(savePracticeResult).mockImplementation(async command=>({status:'ok',operationId:command.operationId,
    requestId:command.requestId,attemptId:'1',actionNo:1}));
  await render();await click('Open practice question');expect(host.textContent).not.toContain('Next question');
  await assess();await select('Practice study session',sessionId);await click('Save my result');
  const first=vi.mocked(savePracticeResult).mock.calls[0][0];
  await act(async()=>root.render(<PracticeQuestion canOpen={false}/>));
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Next question')?.disabled).toBe(true);
  await click('Next question');expect(openPracticeQuestion).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Your practice result is saved.');
  await render();await click('Next question');expect(openPracticeQuestion).toHaveBeenCalledTimes(2);
  const nextRequest=vi.mocked(openPracticeQuestion).mock.calls[1][0];
  expect(nextRequest).not.toBe(first.requestId);expect(nextRequest).toMatch(/^[0-9a-f-]{36}$/);
  expect(host.textContent).not.toContain('Your practice result is saved.');expect(host.querySelector('fieldset')?.disabled).toBe(false);
  for(const input of host.querySelectorAll('select'))expect(input.value).toBe('');
  await click('Save my result');expect(savePracticeResult).toHaveBeenCalledTimes(1);
  await assess();await click('Save my result');
  const second=vi.mocked(savePracticeResult).mock.calls[1][0];
  expect(second.requestId).toBe(nextRequest);expect(second.operationId).not.toBe(first.operationId);
  expect(second.outcome).toEqual({result:'ok',hintLevel:0,novelty:'novel'});
});

it('retains an assessment after definite session rejection and allows a fresh save outside the closed session',async()=>{
  vi.mocked(savePracticeResult).mockImplementationOnce(async command=>{throw new PracticeScoreRejectedError({
    status:'rejected',code:'practice_session_unavailable',operationId:command.operationId,requestId:command.requestId});});
  await render();await click('Open practice question');await assess();await select('Practice study session',sessionId);await click('Save my result');
  const first=vi.mocked(savePracticeResult).mock.calls[0][0];
  expect(host.textContent).not.toContain('Your practice result is saved.');expect(host.textContent).not.toContain('Next question');
  expect(host.querySelector('fieldset')?.disabled).toBe(false);expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/not saved/);
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Practice result"]')?.value).toBe('ok');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Practice hints used"]')?.value).toBe('0');
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Practice question familiarity"]')?.value).toBe('novel');
  expect(host.textContent).not.toContain('Session 3');expect(host.textContent).toContain(delivery.question);
  await select('Practice study session','');await click('Save my result');
  const second=vi.mocked(savePracticeResult).mock.calls[1][0];
  expect(second.operationId).not.toBe(first.operationId);expect(second.requestId).toBe(first.requestId);
  expect(second.outcome).toEqual({result:'ok',hintLevel:0,novelty:'novel'});expect(host.textContent).toContain('Your practice result is saved.');
});

it('keeps the delivered exercise and its session choices when the agenda preview changes or becomes unavailable',async()=>{
  await render();await click('Open practice question');
  await act(async()=>root.render(<PracticeQuestion canOpen={false} sessions={[{id:'other',number:8,project_id:'other-project',state:'open'}]}/>));
  expect(host.textContent).toContain(delivery.question);expect(host.textContent).toContain('Session 3');expect(host.textContent).not.toContain('Session 8');
  await assess();await select('Practice study session',sessionId);await click('Save my result');
  expect(savePracticeResult).toHaveBeenCalledWith(expect.objectContaining({requestId,outcome:{result:'ok',hintLevel:0,novelty:'novel',sessionId}}));
});

it('clears another owner\'s question and rejects an in-flight delivery after an account switch',async()=>{
  let finish:(value:typeof delivery)=>void=()=>{};
  vi.mocked(openPracticeQuestion).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await render();await click('Open practice question');
  await act(async()=>publishAuth({id:'owner-b'}));
  await act(async()=>finish(delivery));expect(host.textContent).not.toContain(delivery.question);expect(host.querySelector('form')).toBeNull();
  await click('Open practice question');expect(host.textContent).toContain(delivery.question);
  await act(async()=>publishAuth(null));expect(host.textContent).not.toContain(delivery.question);expect(savePracticeResult).not.toHaveBeenCalled();
});
