import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import ReviewRoundV7 from '../../../src/features/review-run/v7/ReviewRoundV7';

const fixture=vi.hoisted(()=>({
 released:false,link:'target=checkpoint&id=00000000-0000-4000-8000-000000000020',
 navigate:vi.fn(),queryClient:{invalidateQueries:vi.fn()},resumeRun:vi.fn(),getRun:vi.fn(),openStudyTarget:vi.fn(),targetFromLink:vi.fn(),
}));
vi.mock('../../../src/data/StudyUiRelease',()=>({useStudyUi:()=>fixture.released}));
vi.mock('../../../src/data/authBoundary',()=>({authOwner:()=>null,authGeneration:()=>0,onAccountChange:()=>()=>{}}));
vi.mock('../../../src/data/mode',()=>({getMode:()=>'live'}));
vi.mock('react-router',()=>({useNavigate:()=>fixture.navigate,useSearchParams:()=>[new URLSearchParams(fixture.link)]}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null,isPending:false}),
 useQueryClient:()=>fixture.queryClient}));
vi.mock('../../../src/data/hooks',()=>({useHome:()=>({data:{projects:[]}}),useSettings:()=>({data:null}),
 useReviewItems:()=>({data:[],isPending:false}),useRecordReview:()=>({mutateAsync:vi.fn()})}));
vi.mock('../../../src/features/review-run/v7/scopedRound',()=>({openStudyTarget:fixture.openStudyTarget,
 targetFromLink:fixture.targetFromLink,skipChangedStudyItem:vi.fn()}));
vi.mock('../../../src/features/review-run/v6/adapter',()=>({getRun:fixture.getRun,resumeRun:fixture.resumeRun,
 advanceGrade:vi.fn(),advanceSkip:vi.fn(),cardVersion:vi.fn(),lastGraded:()=>null,pauseRun:vi.fn(),undoLast:vi.fn(),unpauseRun:vi.fn()}));
vi.mock('../../../src/app/v7/V7Shell',()=>({ImmersiveHeader:()=>null}));
vi.mock('../../../src/ui/v7/components',()=>({Button:({children,onClick}:{children:React.ReactNode;onClick:()=>void})=><button onClick={onClick}>{children}</button>}));

let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 fixture.released=false;fixture.link='target=checkpoint&id=00000000-0000-4000-8000-000000000020';
 fixture.resumeRun.mockResolvedValue(null);fixture.getRun.mockResolvedValue(null);
 fixture.openStudyTarget.mockResolvedValue(null);fixture.targetFromLink.mockResolvedValue({kind:'checkpoint',id:'00000000-0000-4000-8000-000000000020'});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
async function render(){await act(async()=>{root.render(<ReviewRoundV7/>);});}

it.each(['target=checkpoint&id=00000000-0000-4000-8000-000000000020','id=missing-kind','concept=compactness'])(
 'never falls through to the active global round while a scoped link is unavailable: %s',async link=>{
  fixture.link=link;await render();
  expect(fixture.resumeRun).not.toHaveBeenCalled();expect(fixture.getRun).not.toHaveBeenCalled();
  expect(fixture.openStudyTarget).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('This review selection is not available yet. Reconnect and try again.');
 });

it('opens the explicit selection once capability becomes available',async()=>{
 await render();expect(fixture.resumeRun).not.toHaveBeenCalled();
 fixture.released=true;await render();
 expect(fixture.targetFromLink).toHaveBeenCalled();
 expect(fixture.openStudyTarget).toHaveBeenCalledWith({kind:'checkpoint',id:'00000000-0000-4000-8000-000000000020'});
 expect(fixture.resumeRun).not.toHaveBeenCalled();
});

it('keeps legacy non-scoped resume available while the new capability is off',async()=>{
 fixture.link='';await render();expect(fixture.resumeRun).toHaveBeenCalled();
});
