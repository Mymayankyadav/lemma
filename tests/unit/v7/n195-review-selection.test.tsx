import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ReviewHubV7 from '../../../src/features/review/v7/ReviewHubV7';

const fixture=vi.hoisted(()=>({
 start:vi.fn(),homeAvailable:true,
 nodes:[
  {key:'project:proofs',label:'Proofs',due:2,children:[
   {key:'cp:proofs:A',label:'Checkpoint A',due:1,children:[]},
   {key:'cp:proofs:B',label:'Checkpoint B',due:1,children:[]},
  ]},
  {key:'project:algebra',label:'Algebra',due:1,children:[]},
 ],
 cards:[
  {cardId:'card-a',projectSlug:'proofs',checkpointCode:'A',state:{state:2}},
  {cardId:'card-b',projectSlug:'proofs',checkpointCode:'B',state:{state:2}},
  {cardId:'card-c',projectSlug:'algebra',checkpointCode:null,state:{state:2}},
 ],
}));
vi.mock('../../../src/data/StudyUiRelease',()=>({useStudyUi:()=>true}));
vi.mock('../../../src/data/hooks',()=>({
 useDeckTree:()=>({data:fixture.nodes,isSuccess:true}),useReviewItems:()=>({data:fixture.cards}),
 useSettings:()=>({data:{reviewsPerDay:100,timeZone:'UTC'},isSuccess:true}),
 useHome:()=>fixture.homeAvailable?{data:{projects:[{id:'path-p',slug:'proofs',subject:{name:'Mathematics'}}]}}:{data:undefined,isError:true},
 useInsightData:()=>({data:{reviews:[]}}),
}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[]})}));
vi.mock('../../../src/features/review/v7/useStartRound',()=>({useStartRound:()=>({start:fixture.start,busy:false,issue:null})}));
vi.mock('../../../src/features/review-run/v6/adapter',()=>({resumeRun:async()=>null}));
vi.mock('../../../src/features/review/v6/estimate',()=>({useReviewEstimate:()=>1}));
vi.mock('../../../src/ui/v7/savedCopy',()=>({useSavedCopyAt:()=>null}));
vi.mock('../../../src/ui/v7/useAnimatedNumber',()=>({useAnimatedNumber:(value:number)=>value}));
vi.mock('../../../src/features/cards/v7/FirstCardPanel',()=>({default:()=>null}));
vi.mock('../../../src/app/v7/V7Shell',()=>({HubHeader:({children}:{children:ReactNode})=><header>{children}</header>}));
vi.mock('../../../src/ui/v7/components',()=>({
 Button:({children,onClick,disabled,'aria-label':label}:{children:ReactNode;onClick:()=>void;disabled?:boolean;'aria-label'?:string})=><button aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>,
 Switch:({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void})=><label><input type="checkbox" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)}/>{label}</label>,
 Sheet:({open,children,footer}:{open:boolean;children:ReactNode;footer:ReactNode})=>open?<section aria-label="Customise this round">{children}{footer}</section>:null,
}));

let host:HTMLDivElement,root:Root;
function Location(){const location=useLocation();return <output aria-label="Location">{location.pathname+location.search}</output>;}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});fixture.homeAvailable=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(path='/review?path=proofs'){
 await act(async()=>root.render(<MemoryRouter initialEntries={[path]}><ReviewHubV7/><Location/></MemoryRouter>));
}
async function press(label:string){
 const button=[...host.querySelectorAll('button')].find(button=>button.textContent===label);
 expect(button,'button '+label).toBeDefined();await act(async()=>button!.click());
}
const count=()=>host.querySelector('[aria-label="Cards in this round"]')?.textContent;

it('starts the displayed customized cohort from a saved path URL',async()=>{
 await render();expect(count()).toBe('2');await press('Customise this round');
 await act(async()=>{
  (host.querySelector('input[aria-label="Checkpoint A · 1 due"]') as HTMLInputElement).click();
 });
 expect(count()).toBe('1');
 await act(async()=>{(host.querySelector('input[aria-label="Algebra"]') as HTMLInputElement).click();});
 expect(count()).toBe('2');await press('Done');await press('Start review');
 expect(fixture.start).toHaveBeenCalledWith([fixture.cards[1],fixture.cards[2]],['cp:proofs:B','project:algebra']);
});

it('can start the displayed path when the unrelated home summary is unavailable',async()=>{
 fixture.homeAvailable=false;await render();expect(count()).toBe('2');await press('Start review');
 expect(fixture.start).toHaveBeenCalledWith(fixture.cards.slice(0,2),['project:proofs','cp:proofs:A','cp:proofs:B']);
});

it('resetting to all decks clears the saved path scope and includes the other path',async()=>{
 await render();await press('Customise this round');await press('Reset to all decks');
 expect(host.querySelector('[aria-label="Location"]')?.textContent).toBe('/review');
 expect(count()).toBe('3');await press('Done');await press('Start review');
 expect(fixture.start).toHaveBeenCalledWith(fixture.cards,['project:proofs','cp:proofs:A','cp:proofs:B','project:algebra']);
});

it('keeps an empty saved path empty rather than selecting unrelated cards',async()=>{
 await render('/review?path=empty');expect(count()).toBe('0');
 const start=host.querySelector('button[aria-label="Start review, 0 cards"]') as HTMLButtonElement;
 expect(start.disabled).toBe(true);await press('Start review');expect(fixture.start).not.toHaveBeenCalled();
});
