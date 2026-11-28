// Every screen path. steps: click:<name> (substring, any control role) | clickx:<exact> | fill:<text> | wait:<ms> | press:<key> | scrollEnd
// group = report section. demo = demo profile.
const D='2026-11-09';
const cap=(...s)=>['click:Capture',...s];
export const scenes=[
 // ───────── Today
 {id:'today',group:'Today',hash:'/'},
 {id:'today-daily-targets',group:'Today',hash:'/',steps:['click:Daily targets']},
 {id:'today-study-details',group:'Today',hash:'/',steps:['click:Study details']},
 {id:'today-quick-focus',group:'Today',hash:'/',steps:['click:Quick focus']},
 {id:'today-first-run',group:'Today',hash:'/',demo:'first-use'},
 {id:'today-stress',group:'Today',hash:'/',demo:'stress'},
 {id:'today-extreme',group:'Today',hash:'/',demo:'extreme'},
 // ───────── Capture + creation drawers
 {id:'capture-empty',group:'Capture & drawers',hash:'/',steps:cap()},
 {id:'capture-task-typed',group:'Capture & drawers',hash:'/',steps:cap('fill:Read Rudin chapter 4 tomorrow 5pm')},
 {id:'capture-time-block',group:'Capture & drawers',hash:'/',steps:cap('click:Time block')},
 {id:'capture-block-busy',group:'Capture & drawers',hash:'/',steps:cap('click:Time block','click:Busy')},
 {id:'capture-card',group:'Capture & drawers',hash:'/',steps:cap('clickx:Card','fill:What is a compact set?')},
 {id:'capture-thought',group:'Capture & drawers',hash:'/',steps:cap('click:Thought','fill:Is every closed bounded set compact in a metric space?')},
 {id:'task-editor',group:'Capture & drawers',hash:'/',steps:cap('fill:Work through Rudin 4','click:Add details')},
 {id:'task-editor-due',group:'Capture & drawers',hash:'/',steps:cap('click:Add details','click:Due: None')},
 {id:'task-editor-path',group:'Capture & drawers',hash:'/',steps:cap('click:Add details','click:Path: No path')},
 {id:'task-editor-more',group:'Capture & drawers',hash:'/',steps:cap('click:Add details','click:More options')},
 {id:'task-editor-priority',group:'Capture & drawers',hash:'/',steps:cap('click:Add details','click:More options','click:Priority')},
 {id:'task-editor-subject',group:'Capture & drawers',hash:'/',steps:cap('click:Add details','click:More options','click:Subject')},
 {id:'block-editor',group:'Capture & drawers',hash:'/',steps:cap('click:Time block','click:Add details')},
 {id:'card-editor-from-capture',group:'Capture & drawers',hash:'/',steps:cap('clickx:Card','click:Add details')},
 {id:'thought-editor',group:'Capture & drawers',hash:'/',steps:cap('click:Thought','click:Add details')},
 {id:'search-sheet',group:'Capture & drawers',hash:'/',steps:['search']},
 {id:'search-query',group:'Capture & drawers',hash:'/',steps:['search','fill:compact']},
 // ───────── Paths
 {id:'paths',group:'Paths',hash:'/projects'},
 {id:'paths-search',group:'Paths',hash:'/projects',steps:['fill:topo']},
 {id:'paths-paused',group:'Paths',hash:'/projects',steps:['click:Paused']},
 {id:'paths-archived',group:'Paths',hash:'/projects',steps:['click:Archived']},
 {id:'paths-card-menu',group:'Paths',hash:'/projects',steps:['click:More for Real Analysis']},
 {id:'new-path',group:'Paths',hash:'/projects/new'},
 {id:'new-path-filled',group:'Paths',hash:'/projects/new',steps:['fill:Measure Theory']},
 {id:'path-plan',group:'Path detail',hash:'/p/real-analysis'},
 {id:'path-stage-open',group:'Path detail',hash:'/p/real-analysis',steps:['click:MAJOR THEOREMS']},
 {id:'path-sessions',group:'Path detail',hash:'/p/real-analysis',steps:['clickx:Sessions']},
 {id:'path-sources',group:'Path detail',hash:'/p/real-analysis',steps:['clickx:Sources']},
 {id:'path-cards',group:'Path detail',hash:'/p/real-analysis',steps:['clickx:Cards']},
 {id:'path-exam',group:'Path detail',hash:'/p/linear-algebra',steps:['clickx:Exam']},
 {id:'path-actions-menu',group:'Path detail',hash:'/p/real-analysis',steps:['click:More path actions']},
 {id:'path-plan-estimates',group:'Path detail',hash:'/p/real-analysis',steps:['click:Plan estimates']},
 {id:'path-goal',group:'Path detail',hash:'/p/real-analysis',steps:['click:Prove the main theorems']},
 {id:'path-set-time',group:'Path detail',hash:'/p/real-analysis',steps:['click:Set time']},
 {id:'path-linear-algebra',group:'Path detail',hash:'/p/linear-algebra'},
 {id:'path-topology',group:'Path detail',hash:'/p/topology'},
 {id:'checkpoint',group:'Path detail',hash:'/p/real-analysis/cp/CP4'},
 {id:'session',group:'Path detail',hash:'/s/real-analysis/7'},
 // ───────── Tutor
 {id:'tutor-path',group:'Tutor',hash:'/p/real-analysis/tutor'},
 {id:'tutor-start',group:'Tutor',hash:'/p/real-analysis/cp/CP4/tutor'},
 {id:'tutor-reading',group:'Tutor',hash:'/p/real-analysis/cp/CP4/tutor',steps:['click:Begin session']},
 {id:'tutor-write-question',group:'Tutor',hash:'/p/real-analysis/cp/CP4/tutor',steps:['click:Write a question']},
 {id:'tutor-keyboard',group:'Tutor',hash:'/p/real-analysis/cp/CP4/tutor',steps:['click:Write a question','click:Use device keyboard','focus:textarea,[contenteditable=true]']},
 // ───────── Cards / Atlas
 {id:'cards',group:'Cards & Atlas',hash:'/cards'},
 {id:'cards-search',group:'Cards & Atlas',hash:'/cards',steps:['fill:eigen']},
 {id:'cards-filter',group:'Cards & Atlas',hash:'/cards',steps:['click:Filter']},
 {id:'card-detail',group:'Cards & Atlas',hash:'/cards/1'},
 {id:'card-new',group:'Cards & Atlas',hash:'/cards?new=1'},
 {id:'atlas-map',group:'Cards & Atlas',hash:'/atlas',steps:['wait:1200']},
 {id:'atlas-list',group:'Cards & Atlas',hash:'/atlas?view=list'},
 {id:'atlas-search',group:'Cards & Atlas',hash:'/atlas',steps:['wait:800','click:Search concepts']},
 {id:'atlas-layers',group:'Cards & Atlas',hash:'/atlas',steps:['wait:800','click:Layers']},
 {id:'atlas-options-hidden',group:'Cards & Atlas',hash:'/atlas',steps:['wait:800','click:Hide options']},
 {id:'atlas-peek',group:'Cards & Atlas',hash:'/atlas',steps:['wait:800','click:Search concepts','fill:compact','click:Compactness']},
 // ───────── Review
 {id:'review-hub',group:'Review',hash:'/review'},
 {id:'review-customise',group:'Review',hash:'/review',steps:['click:Customise this round']},
 {id:'review-actions-menu',group:'Review',hash:'/review',steps:['click:Review actions']},
 {id:'review-run-direct',group:'Review',hash:'/review/run'},
 {id:'review-question',group:'Review',hash:'/review',steps:['click:Start review','wait:800']},
 {id:'review-answer',group:'Review',hash:'/review',steps:['click:Start review','wait:800','click:Show answer','wait:500']},
 {id:'review-done',group:'Review',hash:'/review/done'},
 {id:'review-empty',group:'Review',hash:'/review',demo:'first-use'},
 {id:'practice',group:'Review',hash:'/practice'},
 {id:'practice-archived',group:'Review',hash:'/practice',steps:['click:Archived topics']},
 // ───────── Calendar
 {id:'calendar-day',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`},
 {id:'calendar-week',group:'Calendar & Tasks',hash:`/calendar?view=week&date=${D}`},
 {id:'calendar-month',group:'Calendar & Tasks',hash:`/calendar?view=month&date=${D}`},
 {id:'calendar-agenda',group:'Calendar & Tasks',hash:`/calendar?view=agenda&date=${D}`},
 {id:'calendar-view-menu',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`,steps:['calendarChoices']},
 {id:'calendar-actions-menu',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`,steps:['click:Calendar actions']},
 {id:'calendar-browse-day',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`,steps:['click:Browse day']},
 {id:'calendar-block-open',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`,steps:['click:Solve analysis problems, Planned']},
 {id:'calendar-block-move',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}`,steps:['click:Move Solve analysis problems']},
 {id:'calendar-quick-add',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}&quick=1`},
 {id:'calendar-block-sheet',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}&new=block`},
 {id:'calendar-planner',group:'Calendar & Tasks',hash:`/calendar?view=day&date=${D}&plan=1`},
 {id:'tasks-todo',group:'Calendar & Tasks',hash:'/tasks'},
 {id:'tasks-doing',group:'Calendar & Tasks',hash:'/tasks',steps:['taskColumn:Doing']},
 {id:'tasks-done',group:'Calendar & Tasks',hash:'/tasks',steps:['taskColumn:Done']},
 {id:'tasks-filter',group:'Calendar & Tasks',hash:'/tasks',steps:['click:Filter']},
 {id:'tasks-new',group:'Calendar & Tasks',hash:'/tasks?new=1'},
 {id:'tasks-new-due-picker',group:'Calendar & Tasks',hash:'/tasks?new=1',steps:['click:Due:']},
 {id:'tasks-row-menu',group:'Calendar & Tasks',hash:'/tasks',steps:['click:More actions for Work on eigenvectors']},
 {id:'tasks-triage',group:'Calendar & Tasks',hash:'/tasks',steps:['click:overdue. Triage']},
 // ───────── Progress
 {id:'progress-overview',group:'Progress',hash:'/insights'},
 {id:'progress-30d',group:'Progress',hash:'/insights',steps:['click:30 days']},
 {id:'progress-learning',group:'Progress',hash:'/insights?tab=learning'},
 {id:'progress-unknown-tab-fallback',group:'Progress',hash:'/insights?tab=time'},
 {id:'progress-actions-menu',group:'Progress',hash:'/insights',steps:['click:Progress actions']},
 {id:'progress-add-goal',group:'Progress',hash:'/insights',steps:['click:Add a goal']},
 {id:'progress-edit-goal',group:'Progress',hash:'/insights',steps:['click:Edit']},
 {id:'progress-empty',group:'Progress',hash:'/insights',demo:'first-use'},
 {id:'time-log',group:'Progress',hash:'/log'},
 {id:'time-log-add',group:'Progress',hash:'/log',steps:['click:Add time']},
 {id:'week-page',group:'Progress',hash:'/week'},
 // ───────── Inbox
 {id:'inbox-cards',group:'Inbox',hash:'/proposals'},
 {id:'inbox-list',group:'Inbox',hash:'/proposals?view=list'},
 {id:'inbox-plans',group:'Inbox',hash:'/proposals?tab=plan'},
 {id:'inbox-why',group:'Inbox',hash:'/proposals',steps:['click:Why this card']},
 {id:'inbox-edit',group:'Inbox',hash:'/proposals',steps:['clickx:Edit']},
 {id:'plan-proposal-direct',group:'Inbox',hash:'/proposals/proposal-6'},
 {id:'plan-proposal',group:'Inbox',hash:'/proposals?tab=plan',steps:['click:Compare whole plan','wait:700']},
 // ───────── Settings
 {id:'settings-index',group:'Settings',hash:'/settings'},
 {id:'settings-appearance',group:'Settings',hash:'/settings?section=appearance'},
 {id:'settings-tutor',group:'Settings',hash:'/settings?section=tutor'},
 {id:'settings-tutor-rules',group:'Settings',hash:'/settings?section=tutor',steps:['click:Tutor rules']},
 {id:'settings-study',group:'Settings',hash:'/settings?section=study'},
 {id:'settings-study-advanced',group:'Settings',hash:'/settings?section=study&advanced=1'},
 {id:'settings-planning',group:'Settings',hash:'/settings?section=planning'},
 {id:'settings-reminders',group:'Settings',hash:'/settings?section=reminders'},
 {id:'settings-subjects',group:'Settings',hash:'/settings?section=subjects'},
 {id:'settings-data',group:'Settings',hash:'/settings?section=data'},
 {id:'settings-advanced',group:'Settings',hash:'/settings?section=advanced'},
 {id:'pad',group:'Settings',hash:'/pad'},
 // ───────── Focus / ritual / entry
 {id:'focus-running',group:'Focus & ritual',hash:'/',steps:['click:Start now','wait:1200']},
 {id:'focus-direct',group:'Focus & ritual',hash:'/focus'},
 {id:'close-day',group:'Focus & ritual',hash:'/today/close'},
 {id:'close-day-intention',group:'Focus & ritual',hash:'/today/close',steps:['fill:Compactness via sequences']},
 {id:'close-day-first-task',group:'Focus & ritual',hash:'/today/close',steps:['click:First task tomorrow']},
 {id:'welcome',group:'Entry & errors',hash:'/welcome'},
 {id:'sign-in',group:'Entry & errors',hash:'/sign-in'},
 {id:'not-found',group:'Entry & errors',hash:'/no-such-screen'},
 {id:'offline',group:'Entry & errors',hash:'/',steps:['offline']},
 {id:'design-kit',group:'Entry & errors',hash:'/kit'},
 // ───────── Added for full coverage: states reached by entity, profile or timing rather than by a route of their own
 {id:'pad-path',group:'Settings',hash:'/pad?path=real-analysis'},
 {id:'pad-path-picker',group:'Settings',hash:'/pad',steps:['click:Path: Choose a path']},
 {id:'pad-checkpoint-picker',group:'Settings',hash:'/pad?path=real-analysis',steps:['click:Checkpoint: Choose a checkpoint']},
 {id:'pad-editor',group:'Settings',hash:'/pad?path=real-analysis',steps:['click:Checkpoint: Choose a checkpoint','click:CP4']},
 {id:'path-not-found',group:'Entry & errors',hash:'/p/no-such-path'},
 {id:'checkpoint-not-found',group:'Entry & errors',hash:'/p/real-analysis/cp/CP99'},
 {id:'session-not-found',group:'Entry & errors',hash:'/s/real-analysis/999'},
 {id:'card-not-found',group:'Entry & errors',hash:'/cards/99999'},
 {id:'proposal-not-found',group:'Entry & errors',hash:'/proposals/no-such-proposal'},
 // `loading`: hold every script for 6 s and screenshot after that many ms of a cold load: the boot and loading states.
 {id:'loading-boot',group:'Entry & errors',hash:'/',loading:1200},
 {id:'loading-route',group:'Entry & errors',hash:'/insights',loading:2500},
 {id:'toast-task-complete',group:'Entry & errors',hash:'/tasks',steps:['click:Complete Work on eigenvectors','wait:300']},
 {id:'toast-capture-saved',group:'Entry & errors',hash:'/',steps:['click:Capture','fill:Read Rudin chapter 4','click:Add task','wait:300']},
 {id:'paths-first-use',group:'Empty & stress',hash:'/projects',demo:'first-use'},
 {id:'cards-first-use',group:'Empty & stress',hash:'/cards',demo:'first-use'},
 {id:'calendar-first-use',group:'Empty & stress',hash:`/calendar?view=day&date=${D}`,demo:'first-use'},
 {id:'tasks-first-use',group:'Empty & stress',hash:'/tasks',demo:'first-use'},
 {id:'atlas-first-use',group:'Empty & stress',hash:'/atlas',demo:'first-use',steps:['wait:800']},
 {id:'inbox-first-use',group:'Empty & stress',hash:'/proposals',demo:'first-use'},
 {id:'settings-first-use',group:'Empty & stress',hash:'/settings?section=data',demo:'first-use'},
 {id:'paths-stress',group:'Empty & stress',hash:'/projects',demo:'stress'},
 {id:'cards-stress',group:'Empty & stress',hash:'/cards',demo:'stress'},
 {id:'review-stress',group:'Empty & stress',hash:'/review',demo:'stress'},
 {id:'calendar-stress',group:'Empty & stress',hash:`/calendar?view=week&date=${D}`,demo:'stress'},
 {id:'tasks-stress',group:'Empty & stress',hash:'/tasks',demo:'stress'},
 {id:'progress-stress',group:'Empty & stress',hash:'/insights',demo:'stress'},
 {id:'review-extreme',group:'Empty & stress',hash:'/review',demo:'extreme'},
 {id:'cards-extreme',group:'Empty & stress',hash:'/cards',demo:'extreme'},
 // ───────── Deep links: addressable states that the sweep found by following links (sweep.mjs finds the next ones)
 {id:'exam-tutor',group:'Deep links',hash:'/p/linear-algebra/tutor?exam=demo-exam-project-linear&question=Use+the+exam+planner'},
 {id:'path-exam-sitting',group:'Deep links',hash:'/p/linear-algebra?tab=exam&examSitting=demo-exam-project-linear'},
 {id:'path-tab-sessions',group:'Deep links',hash:'/p/real-analysis?tab=sessions'},
 {id:'path-tab-sources',group:'Deep links',hash:'/p/real-analysis?tab=sources'},
 {id:'path-tab-cards',group:'Deep links',hash:'/p/real-analysis?tab=cards'},
 {id:'path-tab-exam',group:'Deep links',hash:'/p/real-analysis?tab=exam'},
 {id:'checkpoint-sub',group:'Deep links',hash:'/p/real-analysis/cp/CP4a'},
 {id:'calendar-overdue-day',group:'Deep links',hash:'/calendar?view=day&overdue=1'},
 {id:'calendar-quick-task',group:'Deep links',hash:'/calendar?view=day&quick=1&task=demo-task-3&len=25'},
 {id:'review-run-target-path',group:'Deep links',hash:'/review/run?target=path&id=project-analysis'},
 {id:'settings-planning-capacity',group:'Deep links',hash:'/settings?section=planning&capacity=1'},
 {id:'progress-range-day',group:'Deep links',hash:'/insights?range=day'},
 {id:'today-quick-direct',group:'Deep links',hash:'/?quick=1'},
];

// Non-route surfaces and flows that require a populated fixture, a gesture, or more than one action.
const add=(group,id,hash,steps=[],extra={})=>scenes.push({group,id,hash,steps,...extra});
const exam='/p/linear-algebra?tab=exam&examSitting=demo-exam-project-linear';
const setup=['click:More path actions','click:Prepare for an exam'];
add('Exam','exam-setup','/p/real-analysis',setup);
add('Exam','exam-setup-blueprint','/p/real-analysis',[...setup,'clickx:Add row']);
add('Exam','exam-setup-calendar','/p/real-analysis',[...setup,'click:Block time in Calendar']);
const row='click:Write the matrix of a linear transformation';
for(const [id,action] of [['details',null],['defer','Defer…'],['skip','Skip…'],['edit','Edit row'],['review','Review this topic']])
 add('Exam','exam-row-'+id,exam,[row,...(action?['clickx:'+action]:[])]);
add('Exam','exam-time-left',exam,['clickx:Add time']);
add('Exam','path-card-ideas','/p/linear-algebra?tab=cards&cards=ideas');
const pad='/pad?path=real-analysis&checkpoint=CP4';
add('Pad','pad-checkpoint-address','/pad/project-analysis-cp-4?path=real-analysis&checkpoint=CP4');
add('Pad','pad-missing-checkpoint','/pad/not-in-demo?path=real-analysis&checkpoint=CP99');
add('Pad','pad-drawing',pad,['clickx:Draw']);
add('Pad','pad-math-keyboard',pad,['clickx:Use math keyboard']);
for(const [id,actions] of [
 ['paused',['advance:60000','clickx:Pause']],['resumed',['advance:60000','clickx:Pause','advance:60000','click:Resume']],
 ['break',['advance:60000','clickx:Take a break']],['timer-menu',['click:Timer details']],
 ['desk-clock',['click:Timer details','click:Desk clock']],['finish',['clickx:Finish']],
 ['intention',['click:Intention:']],
])add('Focus & ritual','focus-'+id,'/',['click:Start now',...actions]);
add('Focus & ritual','day-closed','/today/close',['click:Close the day'],{expect:'main[aria-label="Day closed"]'});
add('Entry & errors','welcome-create-path','/welcome',['click:Skip this step']);
add('Entry & errors','welcome-study-day','/welcome',['click:Skip this step','click:Skip this step']);
add('Inbox','inbox-plans-list','/proposals?view=list&tab=plan');
add('Progress','progress-range-week','/insights?range=7');
add('Progress','progress-range-quarter','/insights?range=90');
add('Progress','progress-details','/insights',['click:Progress actions','clickx:Progress details']);
add('Calendar & Tasks','task-edit','/tasks',['click:More actions for Work on eigenvectors','clickx:Edit']);
add('Calendar & Tasks','block-delete-confirm','/calendar?view=day&date='+D,['click:Solve analysis problems, Planned','clickx:Delete']);
for(const name of ['Date','Path','Task'])add('Calendar & Tasks','block-pick-'+name.toLowerCase(),'/calendar?view=day&new=block&date='+D,[...(name==='Task'?['clickx:More']:[]),'click:'+name+':']);
add('Cards & Atlas','card-actions','/cards/1',['click:More card actions']);
add('Cards & Atlas','card-edit','/cards/1',['click:Edit card']);
add('Cards & Atlas','card-delete-confirm','/cards/1',['click:More card actions','click:Delete card']);
add('Cards & Atlas','atlas-expanded','/atlas',['click:Search concepts','fill:compact','click:Compactness','click:Show less','click:Show neighbours and actions']);
add('Review','practice-record','/practice',['tapCss:button[aria-label^="Practice "]']);
add('Review','practice-manage','/practice',['tapCss:button[aria-label^="Manage "]']);
add('Path detail','checkpoint-actions','/p/real-analysis/cp/CP4',['click:More checkpoint actions']);
add('Capture & drawers','capture-first-card','/',[...cap('clickx:Card','click:Add details')],{demo:'first-use'});
add('Capture & drawers','capture-discard','/',cap('fill:An unfinished task','press:Escape'));
add('Capture & drawers','search-no-results','/',['search','fill:zzzzunknown']);
const tutor='/p/real-analysis/cp/CP4/tutor';
const scratch=['click:Write a question','focus:[aria-label="Your answer"]','clickx:Scratch'];
add('Tutor','tutor-scratch',tutor,scratch);
add('Tutor','tutor-fullscreen-paper',tutor,[...scratch,'clickx:Full screen']);
for(const [id,hash] of [['welcome','/'],['planning','/settings?section=planning'],['reminders','/settings?section=reminders'],['account','/settings?section=data']])
 add('Android app','android-'+id,hash,[],{devices:['phone-s','tablet-s-p','tablet-s-l'],native:id==='welcome'?'welcome':'app'});

add('Settings','settings-delete-confirm','/settings?section=data',['clickx:Delete…']);
add('Settings','settings-edit-subject','/settings?section=subjects',['tapCss:.v7-subject-rows button']);
add('Local account fixture','account-delete-form','/settings?section=data',['clickx:Delete…'],{account:true,expect:'dialog[open] input:not(:disabled)'});
add('Local account fixture','account-pad-library','/pad',[],{account:true});
add('Local account fixture','account-tutor','/p/logic/cp/CP1/tutor',[],{account:true});
add('Pad','pad-import-preview',pad,['padBackup'],{expect:'[aria-label="Review Pad replacement"]'});
add('Pad','pad-dirty-leave',pad,['fill:Unsaved notes','click:Return to checkpoint'],{expect:'dialog[open]'});
add('Review','review-completed-round','/review',['click:Start review','finishReview']);
add('Review','review-paused-round','/review',['click:Start review','clickx:Leave']);
add('Focus & ritual','focus-log-session','/',['click:Start now','advance:120000','clickx:Finish'],{expect:'dialog[open]'});
add('Focus & ritual','focus-discard-confirm','/',['click:Start now','advance:120000','clickx:Finish','clickx:Discard session']);
add('Tutor','tutor-attachment-menu',tutor,['click:Write a question','click:Attach context']);
add('Tutor','tutor-eraser-choices',tutor,[...scratch,'click:Eraser type']);
add('Cards & Atlas','atlas-edit-concept','/atlas',['click:Search concepts','fill:compact','click:Compactness','click:Edit concept']);

add('Entry & errors','route-chunk-error','/insights',[],{chunkError:true,expect:'main.lemma-route-error'});
add('Entry & errors','route-error-return','/insights',['click:Back to Today'],{chunkError:true,expect:'main[aria-label="Today"]'});

const sources='/p/real-analysis?tab=sources';
add('Path detail','source-reader',sources,['click:rudin 1 of'],{expect:'dialog[open]'});
add('Path detail','source-manager',sources,['click:Manage sources'],{expect:'dialog[open]'});
add('Path detail','source-reader-to-manager',sources,['click:rudin 1 of','click:Manage this source'],{expect:'dialog[open]'});
add('Tutor','tutor-equation-consent',tutor,[...scratch,'draw','click:Recognize equation'],{expect:'dialog[open]'});

for(const state of ['unseen','complete'])
 add('Local account fixture','tutor-questionnaire-'+state,'/p/logic/cp/CP1/tutor',['click:Open questionnaire'],{account:state,expect:'dialog[open]'});
const examChat='/p/linear-algebra/tutor?exam=demo-exam-project-linear';
add('Exam','exam-session-actions',examChat,['click:Session actions']);
add('Exam','exam-connection',examChat,['click:Session actions','clickx:Connection'],{expect:'dialog[open]'});
