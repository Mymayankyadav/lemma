import { McpServer, z } from './deps.ts';
import { Context, scoped } from './db.ts';
import { INSTRUCTIONS } from './rules.ts';
import { packet } from './packet.ts';
import { get, readPages, search } from './tools/read.ts';
import { startSession, saveProgress, endSession, proposeCards, proposeCardEdits, proposePlan, proposePlanChange, createProject, proposals, decide } from './tools/write.ts';
const S=z.string;
const name=S().min(1).max(60).describe('Project slug or title');
const cp=S().max(20).describe('CP code');
const optProject=name.optional();
const noop={readOnlyHint:true};
const write={readOnlyHint:false,destructiveHint:false,openWorldHint:false};
export const TOOL_NAMES=['resume','get','read_pages','search','start_session','save_progress','end_session','propose_cards','propose_card_edits','propose_plan','propose_plan_change','create_project','proposals','decide'];
export function buildServer(c:Context):McpServer{
  const m=new McpServer({name:'lemma',version:'1.0.0'}, {instructions:INSTRUCTIONS});
  const register=(n:string,description:string,schema:any,readOnly:boolean,fn:(a:any)=>Promise<string>)=>{
    m.registerTool(n,{description,inputSchema:schema,annotations:readOnly?noop:write},async(a:any)=>{
      try{
        const result=await fn(a);
        if(!readOnly || n==='resume'||n==='get'||n==='read_pages'||n==='search'||n==='proposals'){
          await c.db.from('settings').update({connector_last_seen_at:new Date().toISOString(),...(n==='start_session'?{connector_last_client:a.client}:{})}).eq('user_id',c.userId);
        }
        return {content:[{type:'text' as const,text:result}]};
      }catch(err){return {isError:true,content:[{type:'text' as const,text:err instanceof Error?err.message:'Request failed'}]}}
    });
  };
  register('resume','Start here when the user wants to study, resume, continue or plan. Returns where they stopped, warm-up, rules and style. Omit project to list projects.',z.object({
    project:optProject,mix:z.boolean().optional().describe('Interleave all active projects'),brief:z.boolean().optional().describe('Skip RULES if already received in this chat')
  }),true,a=>packet(c,a));
  register('get','Read details on demand. what: plan, checkpoint (id CP4), session (id S7), outline, cards (id CP4 or S7), feedback (open card notes), concepts, projects.',z.object({
    what:z.enum(['plan','checkpoint','session','outline','cards','feedback','concepts','projects']).describe('What to read'),project:optProject,
    id:S().max(20).optional().describe('CP4, S7 or source short name'),limit:z.number().int().min(1).max(50).optional().describe('Max items')
  }),true,a=>get(c,a));
  register('read_pages','Read the project\'s PDF by printed page numbers (pdf: true for PDF indexes). Max 5 pages per call.',z.object({
    project:optProject,source:S().optional().describe('Source short name; default first'),from:S().min(1).max(12).describe('First page, e.g. 36 or xiv'),
    to:S().max(12).optional().describe('Last page; max 5 pages'),pdf:z.boolean().optional().describe('Treat from/to as PDF page indexes')
  }),true,a=>readPages(c,a));
  register('search','Full-text search in the project\'s PDFs. Returns pages with short snippets.',z.object({
    query:S().min(2).max(120).describe('Words to find'),project:optProject,limit:z.number().int().min(1).max(8).optional().describe('Max hits, default 5')
  }),true,a=>search(c,a));
  register('start_session','Open a study session before teaching. Returns its code. Reuses an open session on the same checkpoint from the last 3 hours.',z.object({
    project:name,goal:S().min(1).max(200).describe('What this session should achieve'),checkpoint:cp.optional().describe('CP code; default the current one'),
    style:S().optional().describe('Style key; default project style'),client:z.enum(['claude','chatgpt','other']).describe('Which assistant you are')
  }),false,a=>startSession(c,a));
  const event=z.object({
    kind:z.enum(['pretest','attempt','hint','explanation','evidence','recheck','note']),
    text:S().min(1).max(600),
    outcome:z.enum(['demonstrated','partial','failed']).optional().describe('For attempt, evidence, recheck'),
    hint_level:z.number().int().min(1).max(4).optional().describe('For hint'),checkpoint:cp.optional().describe('If not the session\'s checkpoint')
  });
  register('save_progress','Save in one call: step, events, misconception and the next question. Call at each step change and every ~6 messages.',z.object({
    project:name,session:S().min(2).describe('Session code, e.g. S8'),step:z.number().int().min(1).max(8).optional().describe('Current checkpoint step'),
    events:z.array(event).max(10).optional().describe('What happened, in order'),misconception:S().max(120).optional().describe('Short label of a new or repeated error'),
    resolved:S().max(120).optional().describe('Label of a misconception now fixed'),next_question:S().max(300).optional().describe('The question to ask when resuming')
  }),false,a=>saveProgress(c,a));
  register('end_session','Close the session with a short summary and whether its goal was met.',z.object({
    project:name,session:S().describe('Session code'),summary:S().min(1).max(600).describe('2–3 lines: what was learned, what is next'),
    goal_met:z.enum(['yes','partial','no']).describe('Was the goal met?'),recheck_prompt:S().max(300).optional().describe('A retrieval question for this checkpoint')
  }),false,a=>endSession(c,a));
  const card=z.object({
    front:S().min(1).max(1500),back:S().max(3000).optional().describe('Empty for cloze'),
    type:z.enum(['basic','cloze','reverse']).optional(),kind:z.enum(['definition','theorem','why','example','counterexample','proof','other']).optional(),
    checkpoint:cp.optional().describe('CP code'),concept:S().max(60).optional().describe('Idea name for the Atlas'),page:S().max(12).optional().describe('Printed page'),
    reason:S().max(200).optional().describe('Why this card, shown to the user')
  });
  register('propose_cards','Propose up to 8 cards; the user approves them in Lemma. One idea per card, question on front, LaTeX in $...$, cloze as {{c1::...}}. direct only if the user dictated the card.',z.object({
    project:name,session:S().optional().describe('Session code'),cards:z.array(card).min(1).max(8),
    direct:z.boolean().optional().describe('User dictated these; add without approval')
  }),false,a=>proposeCards(c,a));
  const edit=z.object({
    card:S().describe('Note code, e.g. N7'),front:S().max(1500).optional(),back:S().max(3000).optional(),
    type:z.enum(['basic','cloze','reverse']).optional(),resolves:z.array(z.number().int()).optional().describe('Comment numbers this fixes'),
    reason:S().max(200).describe('What changed and why')
  });
  register('propose_card_edits','Propose fixes to existing cards, e.g. answering card notes from get feedback. The user approves in Lemma.',z.object({edits:z.array(edit).min(1).max(10)}),false,a=>proposeCardEdits(c,a));
  const planningCp=z.object({
    title:S().min(1).max(80),objective:S().min(1).max(400).describe('What the student will be able to do'),
    criterion:S().min(1).max(400).describe('Observable evidence, never reading'),steps:z.array(S().min(1).max(80)).min(1).max(8).describe('Short step titles'),
    pages:S().optional().describe('Printed range, e.g. 36-40'),prereqs:z.array(z.number().int()).optional().describe('Indexes (1-based) of earlier checkpoints'),
    concepts:z.array(S().max(60)).max(4).optional().describe('Idea names'),
    recheck_prompt:S().max(300).optional().describe('Retrieval question')
  });
  register('propose_plan','Propose the first plan for a project in planning: ordered checkpoints with observable criteria, steps, pages, prerequisites and concepts. The user approves in Lemma.',z.object({
    project:name,checkpoints:z.array(planningCp).min(3).max(40).describe('In study order'),
    concepts:z.array(z.object({name:S().max(60),blurb:S().max(200).optional(),prereqs:z.array(S()).optional(),related:z.array(S()).optional()})).max(80).optional(),
    reason:S().max(300).optional()
  }),false,a=>proposePlan(c,a));
  register('propose_plan_change','Propose changes to an approved plan: add, update, remove, move, prereq_add, prereq_remove. Keep unaffected checkpoints. The user approves in Lemma.',z.object({
    project:name,ops:z.array(z.object({op:z.enum(['add','update','remove','move','prereq_add','prereq_remove'])}).catchall(z.unknown())).min(1).max(20).describe('Operations as in the plan change format'),
    reason:S().min(1).max(300).describe('Why the plan should change')
  }),false,a=>proposePlanChange(c,a));
  register('create_project','Create a project when the user starts a new subject or goal in chat. Then plan it with propose_plan.',z.object({
    title:S().min(1).max(80).describe('Project title'),subject:S().min(1).max(40).describe('Subject name; created if new'),
    goal:S().min(1).max(1000).describe('The user\'s goal in their words'),glyph:S().max(2).optional().describe('Symbol for a new subject, e.g. ∫'),
    style:S().optional().describe('Style key; default settings'),book:S().max(120).optional().describe('Title of the book the user attached'),
    book_short:S().max(20).optional().describe('Short name, e.g. rudin')
  }),false,a=>createProject(c,a));
  register('proposals','List proposals waiting for approval, numbered P1, P2… Use when the user wants to approve or reject in chat.',z.object({project:optProject}),true,a=>proposals(c,a));
  register('decide','Approve or reject proposals by number, only after the user says so in this chat.',z.object({
    approve:z.array(z.number().int().positive()).max(30).optional().describe('Proposal numbers to approve'),
    reject:z.array(z.number().int().positive()).max(30).optional().describe('Proposal numbers to reject')
  }),false,a=>decide(c,a));
  return m;
}