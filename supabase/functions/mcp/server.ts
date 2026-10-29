import { McpServer, z } from './deps.ts';
import { Context, scoped } from './db.ts';
import { INSTRUCTIONS } from './rules.ts';
import { packet } from './packet.ts';
import { get, readPages, search } from './tools/read.ts';
import { startSession, saveProgress, endSession, proposeCards, proposeCardEdits, proposePlan, proposePlanChange, createProject, proposals, decide } from './tools/write.ts';
const S=z.string;
const name=S().min(1).max(60);
const cp=S().max(20);
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
    project:optProject,mix:z.boolean().optional(),brief:z.boolean().optional()
  }),true,a=>packet(c,a));
  register('get','Read details on demand. what: plan, checkpoint (id CP4), session (id S7), outline, cards (id CP4 or S7), feedback (open card notes), concepts, projects.',z.object({
    what:z.enum(['plan','checkpoint','session','outline','cards','feedback','concepts','projects']),project:optProject,
    id:S().max(20).optional(),limit:z.number().int().min(1).max(50).optional()
  }),true,a=>get(c,a));
  register('read_pages','Read the project\'s PDF by printed page numbers (pdf: true for PDF indexes). Max 5 pages per call.',z.object({
    project:optProject,source:S().optional(),from:S().min(1).max(12),
    to:S().max(12).optional(),pdf:z.boolean().optional()
  }),true,a=>readPages(c,a));
  register('search','Full-text search in the project\'s PDFs. Returns pages with short snippets.',z.object({
    query:S().min(2).max(120),project:optProject,limit:z.number().int().min(1).max(8).optional()
  }),true,a=>search(c,a));
  register('start_session','Open a study session before teaching. Returns its code. Reuses an open session on the same checkpoint from the last 3 hours.',z.object({
    project:name,goal:S().min(1).max(200),checkpoint:cp.optional(),
    style:S().optional(),client:z.enum(['claude','chatgpt','other'])
  }),false,a=>startSession(c,a));
  const event=z.object({
    kind:z.enum(['pretest','attempt','hint','explanation','evidence','recheck','note']),
    text:S().min(1).max(600),
    outcome:z.enum(['demonstrated','partial','failed']).optional(),
    hint_level:z.number().int().min(1).max(4).optional(),checkpoint:cp.optional()
  });
  register('save_progress','Save in one call: step, events, misconception and the next question. Call at each step change and every ~6 messages.',z.object({
    project:name,session:S().min(2),step:z.number().int().min(1).max(8).optional(),
    events:z.array(event).max(10).optional(),misconception:S().max(120).optional(),
    resolved:S().max(120).optional(),next_question:S().max(300).optional()
  }),false,a=>saveProgress(c,a));
  register('end_session','Close the session with a short summary and whether its goal was met.',z.object({
    project:name,session:S(),summary:S().min(1).max(600),
    goal_met:z.enum(['yes','partial','no']),recheck_prompt:S().max(300).optional()
  }),false,a=>endSession(c,a));
  const card=z.object({
    front:S().min(1).max(1500),back:S().max(3000).optional(),
    type:z.enum(['basic','cloze','reverse']).optional(),kind:z.enum(['definition','theorem','why','example','counterexample','proof','other']).optional(),
    checkpoint:cp.optional(),concept:S().max(60).optional(),page:S().max(12).optional(),
    reason:S().max(200).optional()
  });
  register('propose_cards','Propose up to 8 cards; the user approves them in Lemma. One idea per card, question on front, LaTeX in $...$, cloze as {{c1::...}}. direct only if the user dictated the card.',z.object({
    project:name,session:S().optional(),cards:z.array(card).min(1).max(8),
    direct:z.boolean().optional()
  }),false,a=>proposeCards(c,a));
  const edit=z.object({
    card:S(),front:S().max(1500).optional(),back:S().max(3000).optional(),
    type:z.enum(['basic','cloze','reverse']).optional(),resolves:z.array(z.number().int()).optional(),
    reason:S().max(200)
  });
  register('propose_card_edits','Propose fixes to existing cards, e.g. answering card notes from get feedback. The user approves in Lemma.',z.object({edits:z.array(edit).min(1).max(10)}),false,a=>proposeCardEdits(c,a));
  const planningCp=z.object({
    title:S().min(1).max(80),objective:S().min(1).max(400),
    criterion:S().min(1).max(400),steps:z.array(S().min(1).max(80)).min(1).max(8),
    pages:S().optional(),prereqs:z.array(z.number().int()).optional(),
    concepts:z.array(S().max(60)).max(4).optional(),
    recheck_prompt:S().max(300).optional()
  });
  register('propose_plan','Propose the first plan for a project in planning: ordered checkpoints with observable criteria, steps, pages, prerequisites and concepts. The user approves in Lemma.',z.object({
    project:name,checkpoints:z.array(planningCp).min(3).max(40),
    concepts:z.array(z.object({name:S().max(60),blurb:S().max(200).optional(),prereqs:z.array(S()).optional(),related:z.array(S()).optional()})).max(80).optional(),
    reason:S().max(300).optional()
  }),false,a=>proposePlan(c,a));
  register('propose_plan_change','Propose changes to an approved plan: add, update, remove, move, prereq_add, prereq_remove. Keep unaffected checkpoints. The user approves in Lemma.',z.object({
    project:name,ops:z.array(z.object({op:z.enum(['add','update','remove','move','prereq_add','prereq_remove'])}).catchall(z.unknown())).min(1).max(20),
    reason:S().min(1).max(300)
  }),false,a=>proposePlanChange(c,a));
  register('create_project','Create a project when the user starts a new subject or goal in chat. Then plan it with propose_plan.',z.object({
    title:S().min(1).max(80),subject:S().min(1).max(40),
    goal:S().min(1).max(1000),glyph:S().max(2).optional(),
    style:S().optional(),book:S().max(120).optional(),
    book_short:S().max(20).optional()
  }),false,a=>createProject(c,a));
  register('proposals','List proposals waiting for approval, numbered P1, P2… Use when the user wants to approve or reject in chat.',z.object({project:optProject}),true,a=>proposals(c,a));
  register('decide','Approve or reject proposals by number, only after the user says so in this chat.',z.object({
    approve:z.array(z.number().int().positive()).max(30).optional(),
    reject:z.array(z.number().int().positive()).max(30).optional()
  }),false,a=>decide(c,a));
  return m;
}