import { McpServer, z } from './deps.ts';
import { Context, scoped, commitBatch } from './db.ts';
import {setPrompt,history,undo,edit,add,remove,review,grade} from './tools/control.ts';
import {cut} from './text.ts';
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
export const TOOL_NAMES=['resume','get','read_pages','search','start_session','save_progress','end_session','propose_cards','propose_card_edits','propose_plan','propose_plan_change','create_project','proposals','decide','set_prompt','history','undo','edit','add','delete','review','grade'];
// tools/list is sent with every chat turn (budget 15,000 chars). Advertise
// the same zod schema without the per-tool "$schema" dialect line (2020-12 is
// the MCP default) and without the ±2^53-1 bounds zod adds to plain integers.
// Validation still runs through zod's own ~standard.validate.
const SAFE_INT=Number.MAX_SAFE_INTEGER;
function prune(node:any):any{
  if(Array.isArray(node))return node.map(prune);
  if(!node||typeof node!=='object')return node;
  const out:any={};
  for(const [k,v] of Object.entries(node)){
    if(k==='$schema')continue;
    if((k==='maximum'&&v===SAFE_INT)||(k==='minimum'&&v===-SAFE_INT))continue;
    out[k]=prune(v);
  }
  return out;
}
export function lean(schema:any):any{
  const std=schema['~standard'];
  return {'~standard':{...std,jsonSchema:{
    input:(o:any)=>prune(std.jsonSchema.input(o)),
    output:(o:any)=>prune(std.jsonSchema.output(o))
  }}};
}
export function buildServer(c:Context):McpServer{
  const m=new McpServer({name:'lemma',version:'1.0.0'}, {instructions:INSTRUCTIONS});
  const register=(n:string,description:string,schema:any,readOnly:boolean,fn:(a:any,ctx:Context)=>Promise<string>)=>{
    m.registerTool(n,{description,inputSchema:lean(schema),annotations:readOnly?noop:write},async(a:any)=>{
      try{
        const ctx:Context=readOnly?c:{...c,batch:[]};
        let result=await fn(a,ctx);
        let action:number|null=null;
        if(ctx.batch?.length){
          const data=await commitBatch(ctx,n,a,result);action=data?.action;if(n==='undo')result+=' (as A'+action+')';if(n==='add')result+=' '+(data.created||[]).filter((x:any)=>x.table==='notes'||x.table==='checkpoints').map((x:any)=>x.code||'N'+x.no).join(', ');if(n==='grade')result+='; '+(await review(c,{count:1})).split('\n')[0]+' still';
        }
        if(!action)await c.db.rpc('mcp_seen',{p_user:c.userId});
        const next=n==='resume'?'start_session, then WARM questions':n==='start_session'?'pretest or continue; save_progress at each step':n==='save_progress'?(a.next_question||'continue; save again within ~6 messages'):n.startsWith('propose_')?'tell the user it waits for approval':n==='end_session'?'stop':n==='review'?'show only the first front':n==='grade'?'next card or review again':n==='delete'&&!a.confirm?'ask the user to confirm the listed deletion':'continue with the user';
        const suffix='\nNEXT: '+next.slice(0,100)+(action?'\nUndo: A'+action:'');
        if(!readOnly&&!(n==='delete'&&!a.confirm))result=cut(result,Math.max(20,160-suffix.length));
        result+=suffix;
        return {content:[{type:'text' as const,text:result}]};
      }catch(err){return {isError:true,content:[{type:'text' as const,text:err instanceof Error?err.message:'Request failed'}]}}
    });
  };
  register('resume','Start here to study or plan: position, warm-up, rules and ETA. Omit project to list projects.',z.object({
    project:optProject,mix:z.boolean().optional(),brief:z.boolean().optional()
  }),true,(a,ctx)=>packet(ctx,a));
  register('get','Read details on demand. what: plan, plan_revisions, checkpoint (id CP4), session (id S7), sources, outline, cards (id CP4 or S7), feedback, concepts, projects, prompt, diagnostics.',z.object({
    what:z.enum(['plan','plan_revisions','checkpoint','session','sources','outline','cards','feedback','concepts','projects','prompt','diagnostics']),project:optProject,
    id:S().max(20).optional(),limit:z.number().int().min(1).max(50).optional()
  }),true,(a,ctx)=>get(ctx,a));
  register('read_pages','Read the project\'s PDF by printed page numbers (pdf: true for PDF indexes). Max 5 pages per call.',z.object({
    project:optProject,source:S().optional(),from:S().min(1).max(12),
    to:S().max(12).optional(),pdf:z.boolean().optional()
  }),true,(a,ctx)=>readPages(ctx,a));
  register('search','Full-text search across the project PDFs; optionally narrow to one source short code.',z.object({
    query:S().min(2).max(120),project:optProject,source:S().max(20).optional(),limit:z.number().int().min(1).max(8).optional()
  }),true,(a,ctx)=>search(ctx,a));
  register('start_session','Open a study session before teaching. Returns its code. Reuses an open session on the same checkpoint from the last 3 hours.',z.object({
    project:name,goal:S().min(1).max(200),checkpoint:cp.optional(),
    style:S().optional(),client:z.enum(['claude','chatgpt','other'])
  }),false,(a,ctx)=>startSession(ctx,a));
  const event=z.object({
    kind:z.enum(['pretest','attempt','hint','explanation','evidence','recheck','note']),
    text:S().min(1).max(600),
    outcome:z.enum(['demonstrated','partial','failed']).optional(),
    hint_level:z.number().int().min(1).max(4).optional(),checkpoint:cp.optional()
  });
  register('save_progress','Save in one call: step, events, misconception and the next question. Call at each step change and every ~6 messages.',z.object({
    project:name,session:S().min(2),step:z.number().int().min(1).max(8).optional(),
    diagnostics:z.array(z.object({kind:z.enum(['gap','strength','material','pace']),topic:S().min(1).max(120),evidence:S().max(600),severity:z.number().int().min(1).max(3).optional(),confirmed:z.boolean().optional()})).max(8).optional(),events:z.array(event).max(10).optional(),misconception:S().max(120).optional(),
    resolved:S().max(120).optional(),next_question:S().max(300).optional()
  }),false,(a,ctx)=>saveProgress(ctx,a));
  register('end_session','Close the session with a short summary and whether its goal was met.',z.object({
    project:name,session:S(),summary:S().min(1).max(600),
    goal_met:z.enum(['yes','partial','no']),recheck_prompt:S().max(300).optional()
  }),false,(a,ctx)=>endSession(ctx,a));
  const card=z.object({
    front:S().min(1).max(1500),back:S().max(3000).optional(),
    type:z.enum(['basic','cloze','reverse']).optional(),kind:z.enum(['definition','theorem','why','example','counterexample','proof','other']).optional(),
    checkpoint:cp.optional(),concept:S().max(60).optional(),page:S().max(12).optional(),
    reason:S().max(200).optional()
  });
  register('propose_cards','Propose up to 8 cards; the user approves them in Lemma. One idea per card, question on front, LaTeX in $...$, cloze as {{c1::...}}. direct only if the user dictated the card.',z.object({
    project:name,session:S().optional(),cards:z.array(card).min(1).max(8),
    direct:z.boolean().optional()
  }),false,(a,ctx)=>proposeCards(ctx,a));
  const cardEditSchema=z.object({
    card:S(),front:S().max(1500).optional(),back:S().max(3000).optional(),
    type:z.enum(['basic','cloze','reverse']).optional(),resolves:z.array(z.number().int()).optional(),
    reason:S().max(200)
  });
  register('propose_card_edits','Propose fixes to existing cards, e.g. answering card notes from get feedback. The user approves in Lemma.',z.object({edits:z.array(cardEditSchema).min(1).max(10)}),false,(a,ctx)=>proposeCardEdits(ctx,a));
  const planningCp=z.object({
    stage:S().max(40).nullable().optional(),title:S().min(1).max(80),objective:S().min(1).max(400),
    criterion:S().min(1).max(400),steps:z.array(S().min(1).max(80)).min(1).max(8),
    pages:S().optional(),due_on:S().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    sources:z.array(z.object({source:S().min(1).max(20),pages:S().max(120).optional()})).max(12).optional(),
    prereqs:z.array(z.number().int()).optional(),
    concepts:z.array(S().max(60)).max(4).optional(),
    recheck_prompt:S().max(300).optional()
  });
  register('propose_plan','Propose a first plan: checkpoints with stage, criteria, steps, pages, prerequisites; concepts with topic. User approval required.',z.object({
    project:name,checkpoints:z.array(planningCp).min(3).max(40),
    concepts:z.array(z.object({name:S().min(1).max(60),level:z.enum(['cluster','galaxy','system','planet','moon']).optional(),parent:S().max(60).nullable().optional(),star:z.boolean().optional(),topic:S().max(40).nullable().optional(),blurb:S().max(200).optional(),prereqs:z.array(S()).optional(),related:z.array(S()).optional()})).max(80).optional(),
    reason:S().max(300).optional()
  }),false,(a,ctx)=>proposePlan(ctx,a));
  register('propose_plan_change','Propose changes to an approved plan: add, update, remove, move, prereq_add, prereq_remove. Keep unaffected checkpoints. The user approves in Lemma.',z.object({
    project:name,ops:z.array(z.object({op:z.enum(['add','update','remove','move','prereq_add','prereq_remove'])}).catchall(z.unknown())).min(1).max(20),
    concepts:z.array(z.object({name:S().min(1).max(60),level:z.enum(['cluster','galaxy','system','planet','moon']).optional(),parent:S().max(60).nullable().optional(),star:z.boolean().optional(),blurb:S().max(200).optional(),prereqs:z.array(S()).optional(),related:z.array(S()).optional()})).max(80).optional(),
    diagnostics:z.array(S().regex(/^D[0-9]+$/)).max(20).optional(),book:S().max(20).optional(),reason:S().min(1).max(300)
  }),false,(a,ctx)=>proposePlanChange(ctx,a));
  register('create_project','Start a sources-first project with only a name, optionally a subject, goal, schedule and PDF metadata. Student uploads actual PDF bytes in Lemma; tutor proposes the plan for approval.',z.object({
    target_date:S().nullable().optional(),target_label:S().max(20).nullable().optional(),title:S().min(1).max(80),subject:S().min(1).max(40).optional(),
    goal:S().min(1).max(1000).optional(),glyph:S().max(2).optional(),
    style:S().optional(),book:S().max(120).optional(),
    book_short:S().max(20).optional()
  }),false,(a,ctx)=>createProject(ctx,a));
  register('proposals','List proposals waiting for approval, numbered P1, P2… Use when the user wants to approve or reject in chat.',z.object({project:optProject}),true,(a,ctx)=>proposals(ctx,a));
  register('decide','Approve or reject proposals by number, only after the user says so in this chat.',z.object({
    approve:z.array(z.number().int().positive()).max(30).optional(),
    reject:z.array(z.number().int().positive()).max(30).optional()
  }),false,(a,ctx)=>decide(ctx,a));
  register('set_prompt',"Save the user's standing instructions (all chats, or one project). Use when they say always/never/from now on.",z.object({scope:S(),text:S().max(2000),mode:z.enum(['replace','append','clear']).optional()}),false,(a,ctx)=>setPrompt(ctx,a));
  register('history','List recent changes (A-numbers) from chats and the app, to find something to undo.',z.object({project:optProject,limit:z.number().int().min(1).max(30).optional()}),true,(a,ctx)=>history(ctx,a));
  register('undo','Reverse a change by its A-number (from history or a tool’s reply). Undoing an undo restores it.',z.object({action:z.number().int().positive(),force:z.boolean().optional()}),false,(a,ctx)=>undo(ctx,a));
  register('edit','Change any detail the user asks for: project, checkpoint, session, card, comment, idea, subject, style, book or settings. Applies at once; undoable.',z.object({target:S(),project:optProject,set:z.record(S(),z.unknown())}),false,(a,ctx)=>edit(ctx,a));
  register('add','Create something directly when the user asks: checkpoint, card, subject, idea, style, comment or book. Undoable.',z.object({kind:z.enum(['checkpoint','card','subject','idea','style','comment','book']),project:optProject,fields:z.record(S(),z.unknown())}),false,(a,ctx)=>add(ctx,a));
  register('delete','Delete a project, checkpoint, session, card, comment, idea, subject, style, book or proposal the user wants gone. Undoable with undo.',z.object({target:S(),project:optProject,confirm:z.boolean()}),false,(a,ctx)=>remove(ctx,a));
  register('review','Get the next due flashcards to quiz the user in chat (mixed across decks unless a project is given).',z.object({project:optProject,count:z.number().int().min(1).max(10).optional(),new:z.boolean().optional()}),true,(a,ctx)=>review(ctx,a));
  register('grade',"Record the user's answers to review cards: again, hard, good or easy, with optional confidence.",z.object({answers:z.array(z.object({card:S(),rating:z.enum(['again','hard','good','easy']),confidence:z.enum(['sure','unsure','guess']).optional()})).min(1).max(10)}),false,(a,ctx)=>grade(ctx,a));
  return m;
}