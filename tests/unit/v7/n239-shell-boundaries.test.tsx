import {act,StrictMode,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import V7Shell from '../../../src/app/v7/V7Shell';
import {holdCaptureText,takeCaptureText} from '../../../src/platform/share';
import {publishAuth} from '../../../src/data/authBoundary';
import {readRoomRecent} from '../../../src/ui/v7/room';

const f=vi.hoisted(()=>({home:{projects:[],due:0},settings:{timeZone:'UTC',ui:{}},createTask:vi.fn(),room:false}));
vi.mock('../../../src/data/hooks',()=>({useHome:()=>({data:f.home}),useSettings:()=>({data:f.settings})}));
vi.mock('../../../src/data/tasks',()=>({getTaskApi:()=>({createTask:f.createTask})}));
vi.mock('../../../src/platform/voice',()=>({useNativeVoice:()=>({available:false})}));
vi.mock('../../../src/data/StudyUiRelease',()=>({useStudyUi:()=>false}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn(),clearToasts:()=>{}}));
vi.mock('../../../src/ui/v7/useHapticsSetting',()=>({useHapticsSetting:()=>{}}));
vi.mock('../../../src/platform/useDeviceCommands',()=>({useDeviceCommands:()=>{}}));
vi.mock('../../../src/app/OfflineBanner',()=>({default:()=>null}));
vi.mock('../../../src/app/v7/useMinWidth',()=>({useMinWidth:()=>true}));
vi.mock('../../../src/app/v7/subjectColours',()=>({useSubjectColours:()=>0}));
vi.mock('../../../src/app/v7/focus',()=>({useActiveFocus:()=>({entry:null}),useFocusChangeListener:()=>{},useNow:()=>0}));
vi.mock('../../../src/ui/v7/paper',()=>({applyPaper:()=>{}}));
vi.mock('../../../src/ui/v7/FirstUseHint',()=>({FirstUseHint:()=>null}));
vi.mock('../../../src/flags',()=>({isFlagOn:(name:string)=>name==='v7Room'&&f.room}));
vi.mock('../../../src/ui/v7/components',()=>({
 Sheet:({open,title,children,footer,onClose}:any)=>open?<section><button onClick={onClose}>{'Close '+title}</button>{children}{footer}</section>:null,
 Button:({children,onClick,disabled}:any)=><button onClick={onClick} disabled={disabled}>{children}</button>,
 IconButton:()=>null,Segmented:()=>null,
}));
let host:HTMLDivElement,root:Root;
const render=(children:ReactNode=<main/>,key='session',capture=true)=>act(async()=>root.render(
 <StrictMode><MemoryRouter initialEntries={['/p/private']}><V7Shell key={key} capture={capture}>{children}</V7Shell></MemoryRouter></StrictMode>));
const click=(text:string)=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text)!.click();});
const captureText=()=>host.querySelector<HTMLTextAreaElement>('textarea[aria-label="What do you want to add?"]')?.value;
async function openCapture(){
 await act(async()=>{window.dispatchEvent(new Event('v7:capture'));});
 await act(async()=>{await vi.dynamicImportSettled();});
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();sessionStorage.clear();history.replaceState({},'','/?demo=0');
 while(takeCaptureText()!==null){/* Each test starts with an empty native queue. */}
 publishAuth(null);publishAuth({id:'owner-a'});f.room=false;f.createTask.mockReset().mockResolvedValue({record:{id:'task',version:1}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();publishAuth(null);});
it('preserves every queued share across StrictMode effects and exposes the next on close',async()=>{
 await render();holdCaptureText('First proof');holdCaptureText('Second proof');holdCaptureText('Third proof');await openCapture();
 expect(captureText()).toBe('First proof');await click('Close Capture');
 expect(captureText()).toBe('Second proof');await click('Close Capture');
 expect(captureText()).toBe('Third proof');await click('Close Capture');
 expect(captureText()).toBeUndefined();expect(takeCaptureText()).toBeNull();
});
it('opens the next share after saving without overwriting the currently visible capture',async()=>{
 await render();holdCaptureText('First task');await openCapture();
 holdCaptureText('Second task');await openCapture();expect(captureText()).toBe('First task');
 await click('Add task');expect(f.createTask).toHaveBeenCalledWith(expect.objectContaining({title:'First task'}));
 expect(captureText()).toBe('Second task');await click('Add task');
 expect(f.createTask.mock.calls.map(call=>call[0].title)).toEqual(['First task','Second task']);
 expect(captureText()).toBeUndefined();
});
it('never records the old route DOM title under a newly signed-in owner',async()=>{
 f.room=true;await render(<main><h1>PRIVATE OWNER A TITLE</h1></main>,'original',false);
 expect(readRoomRecent().map(row=>row.title)).toEqual(['PRIVATE OWNER A TITLE']);
 // The auth publication can precede the route cache replacement. Keep the old DOM mounted deliberately.
 await act(async()=>publishAuth({id:'owner-b'}));
 expect(readRoomRecent()).toEqual([]);
 await render(<main><h1>OWNER B TITLE</h1></main>,'new-owner',false);
 expect(readRoomRecent().map(row=>row.title)).toEqual(['OWNER B TITLE']);
});
