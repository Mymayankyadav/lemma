import type {
  LemmaApi,
  SettingsPatch,
  StylePatch,
  CreateSubjectInput,
  ProjectPatch,
  ProposalEdit,
  CreateNoteInput,
  NotePatch,
  InsightDays,
  ReviewLogEntry,
  SubjectPatch,
  SourcePatch,
} from "../api";
import { LemmaError } from "../api";
import {decodeCardPageCursor,encodeCardPageCursor,olderThanKey} from "../card-cursor";
import type {
  AtlasGraph,
  CardComment,
  CardDetail,
  CardRow,
  CardState,
  CheckpointDetail,
  CheckpointView,
  DeckNode,
  HomeSummary,
  IngestProgress,
  InsightData,
  NewProjectInput,
  NoteStatus,
  PlanCheckpoint,
  PlanPayload,
  PlanRevision,
  Project,
  ProjectDetail,
  ProjectSummary,
  Proposal,
  QueueFilter,
  RecordReviewInput,
  ReviewItem,
  SessionDetail,
  SessionSummary,
  Settings,
  Source,
  Style,
  Subject,
} from "../types";
import type {
  DemoCheckpoint,
  DemoConcept,
  DemoNote,
  DemoProject,
  DemoProposal,
  DemoReview,
  DemoSession,
  DemoSource,
  DemoStore,
} from "./model";
import fixtureText from "./fixture.json?raw";
import { hydrateFixture } from "./hydrate";
import {
  checkpointUi,
  conceptStatus,
  dueToday,
  sessionDisplay,
  studyDayBounds,
  studyDay,
} from "../../lib/derive";
import { filterReviewItems } from "../../lib/queue";
import { parseSteps } from "../../lib/fsrs";
import {clozeOrds} from "./cloze";
import { slugify } from "../../lib/text";
import { DAY, studyClock } from "../../lib/calendar";
import {fillStressAtlas, fillStressSources, makeStressInsightAggregate, makeStressNotes, makeStressProjectSources, stressSessionEvents, stressSourcePage} from "./stress";

// One parse per module, not once per each of the 1,000 virtual sessions.
export const demoSeedFixture = JSON.parse(fixtureText) as DemoStore;
const stressSessionTemplate = demoSeedFixture.sessions[0];

const clone = <T>(value: T): T => structuredClone(value);
const invalid = (message: string): never => {
  throw new LemmaError("invalid", message);
};
const conflict = (message: string): never => {
  throw new LemmaError("conflict", message);
};
const found = <T>(value: T | undefined, label: string): T => {
  if (value === undefined)
    throw new LemmaError("not_found", `${label} not found`);
  return value;
};
function text(
  value: unknown,
  min: number,
  max: number,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    Array.from(value).length < min ||
    Array.from(value).length > max
  )
    invalid(`${label} must be ${min}–${max} characters`);
}
function keys(value: object, allowed: readonly string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    invalid("Unknown or read-only field");
}
const cpKey = (project: string, code: string) => `${project}:${code}`;
const conceptSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "concept";
export interface DemoOptions {
  now?: () => number;
  timeZone?: string;
  fixture?: DemoStore;
  /** Only set for a freshly generated private store, never a shared fixture. */
  ownedFixture?: boolean;
}
/** Reuse one pass across the large stress fixture when summarising every
 * project. Single-project reads keep the same standalone summary semantics. */
interface SummaryIndex {
  checkpoints: Map<string,DemoCheckpoint[]>;
  cards: Map<string,number>;
  sessions: Map<string,number>;
  sourceTitles: Map<string,string[]>;
}
/** Per-tab memory only; construction/reload restores the fixed seed. No network writes. */
export class DemoAdapter implements LemmaApi {
  readonly mode = "demo" as const;
  /** CONTRACT-546: bounded history pagination remains fail-closed until FIX-546b lands. */
  async getCardHistoryPage(...args: Parameters<LemmaApi["getCardHistoryPage"]>): ReturnType<LemmaApi["getCardHistoryPage"]> {
    const [no,cursor]=args,n=this.readOnlyNote(no),key=decodeCardPageCursor(cursor,'reviews',no);
    const ids=new Set(n.cards.map(c=>c.id));
    const page=this.store.reviews.filter(r=>ids.has(r.cardId)&&!r.undoneAt)
      .sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt)||b.id-a.id)
      .filter(r=>!key||olderThanKey({at:r.reviewedAt,id:String(r.id)},key))
      .slice(0,21);
    const visible=page.slice(0,20);
    return {rows:visible.map(r=>({reviewedAt:r.reviewedAt,rating:r.rating,confidence:r.confidence})),
      nextCursor:page.length>20?encodeCardPageCursor('reviews',no,{at:visible[19].reviewedAt,id:String(visible[19].id)}):null};
  }
  async getCardCommentsPage(...args: Parameters<LemmaApi["getCardCommentsPage"]>): ReturnType<LemmaApi["getCardCommentsPage"]> {
    const [no,cursor]=args,n=this.readOnlyNote(no),key=decodeCardPageCursor(cursor,'comments',no);
    const page=[...n.comments].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.no-a.no)
      .filter(c=>!key||olderThanKey({at:c.createdAt,id:String(c.no)},key))
      .slice(0,21);
    const visible=page.slice(0,20);
    return {rows:clone(visible),nextCursor:page.length>20
      ?encodeCardPageCursor('comments',no,{at:visible[19].createdAt,id:String(visible[19].no)}):null};
  }
  async getReviewForecast(): ReturnType<LemmaApi["getReviewForecast"]> {
    // Home, DeckTree and the seven-day forecast share one exact due-card pass.
    // Return a copy so a consumer cannot mutate the cached daily buckets.
    return this.dueSnapshot().forecastDays.map(day=>({...day}));
  }
  private store: DemoStore;
  private stressSourceSeedTitles:Map<string,string[]>|null=null;
  private stressSourceSeedRows:DemoSource[]|null=null;
  private readonly now: () => number;
  private stressDayStart: number | undefined;
  private virtualStressDue: {overdue:number;future:number}|null=null;
  private virtualReviewNotes: DemoNote[]|null=null;
  private readonly virtualCardCache=new Map<number,DemoNote>();
  // Due dates are immutable ISO values until a card is edited; keying by the
  // timestamp string preserves correctness after edits without invalidation.
  // The 30k-card fixture repeats two dates, so cold Today and DeckTree should
  // parse each distinct value once, not once per card per query.
  private readonly dueTimes = new Map<string,number>();
  private dueTime(value:string):number {
    const cached=this.dueTimes.get(value);
    if(cached!==undefined)return cached;
    const parsed=Date.parse(value);
    this.dueTimes.set(value,parsed);
    return parsed;
  }
  // Home, the deck tree and the ReviewOutlook mount together. A single
  // exact backlog pass avoids re-reading 30,000 cards under 4x CPU. Expire
  // precisely at the next future due timestamp (not an arbitrary TTL).
  private dueSnapshotCache: {
    createdAt:number;validUntil:number;total:number;
    projectCounts:Map<string,number>;checkpointCounts:Map<string,number>;
    cardCounts:Map<string,number>;forecastDays:{day:string;due:number}[];
  }|null=null;
  private dueSnapshot(){
    const now=this.now(),cached=this.dueSnapshotCache;
    if(cached&&now>=cached.createdAt&&now<cached.validUntil)return cached;
    const activeProjects=new Map(this.store.projects
      .filter(p=>p.status!=="archived"&&!p.system).map(p=>[p.id,p] as const));
    const projectCounts=new Map<string,number>(),checkpointCounts=new Map<string,number>(),cardCounts=new Map<string,number>();
    const clock=studyClock(this.store.settings.rolloverHour,this.store.settings.timeZone);
    const today=clock.dayIndex(now);
    const forecastDays=Array.from({length:7},(_,i)=>({
      day:new Date((today+i)*DAY).toISOString().slice(0,10),due:0,
    }));
    // A generated private S/X store represents all 5k/30k cards exactly,
    // but Today and DeckTree need counts, not the entire note object graph.
    // Materialize actual notes only when a card route requests them.
    const virtual=this.virtualStressDue;
    if(virtual&&Object.getOwnPropertyDescriptor(this.store,'notes')?.get){
      const count=this.store.stressNoteCount??0;
      const dueCount=Math.min(count,Math.max(0,this.store.stressDueCount??0));
      const projects=this.store.projects,active=activeProjects;
      const projectTotal=projects.length;
      const occurrences=(end:number,residue:number,period:number)=>
        end>residue?Math.floor((end-1-residue)/period)+1:0;
      const offsets=[virtual.overdue,virtual.future].map(due=>
        Math.max(0,clock.dayIndex(due)-today));
      const earlyDue=virtual.overdue<=now,lateDue=virtual.future<=now;
      let total=0,nextDue=Infinity;
      // Synthetic notes are distributed cyclically by project. Counting
      // their future 26k cards one by one on cold Today wastes the 4x CPU
      // budget; closed-form residue counts retain the exact per-project and
      // seven-day forecast semantics, even after a study-day rollover.
      for(let p=0;p<projectTotal;p++){
        const project=projects[p];
        const cards=occurrences(count,p,projectTotal);
        const early=occurrences(dueCount,p,projectTotal),late=cards-early;
        cardCounts.set(project.id,cards);
        if(!active.has(project.id))continue;
        if(offsets[0]<forecastDays.length)forecastDays[offsets[0]].due+=early;
        if(offsets[1]<forecastDays.length)forecastDays[offsets[1]].due+=late;
        const due=(earlyDue?early:0)+(lateDue?late:0);
        if(due){total+=due;projectCounts.set(project.slug,due)}
        if(!earlyDue&&early)nextDue=Math.min(nextDue,virtual.overdue);
        if(!lateDue&&late)nextDue=Math.min(nextDue,virtual.future);
      }
      // CP codes cycle every 36 cards. Their joint distribution with the
      // project cycle repeats after lcm(projects,36), at most 180 records in
      // the owner-approved 15/60-project stress worlds. Count each residue
      // exactly instead of scanning 4k overdue (or 30k matured) card objects.
      if(projectTotal){
        const gcd=(a:number,b:number):number=>{
          while(b){const next=a%b;a=b;b=next}
          return a;
        };
        const cycle=projectTotal/gcd(projectTotal,36)*36;
        for(let residue=0;residue<cycle;residue++){
          const project=projects[residue%projectTotal];
          if(!active.has(project.id))continue;
          const early=occurrences(dueCount,residue,cycle);
          const late=occurrences(count,residue,cycle)-early;
          const due=(earlyDue?early:0)+(lateDue?late:0);
          if(!due)continue;
          const key=cpKey(project.slug,`CP${residue%36+1}`);
          checkpointCounts.set(key,(checkpointCounts.get(key)??0)+due);
        }
      }
      return this.dueSnapshotCache={createdAt:now,validUntil:Math.min(nextDue,clock.dayStart(today+1)),
        total,projectCounts,checkpointCounts,cardCounts,forecastDays};
    }
    const offsetByDue=new Map<string,number>();
    let total=0,nextDue=Infinity;
    for(const note of this.store.notes){
      // Project summaries count suspended cards too, but not deleted notes.
      if(note.note.status!=="deleted")
        cardCounts.set(note.projectId,(cardCounts.get(note.projectId)??0)+note.cards.length);
      const project=activeProjects.get(note.projectId);
      if(!project||note.note.status!=="active")continue;
      for(const card of note.cards){
        if(card.state.state<=0)continue;
        const due=this.dueTime(card.state.due);
        if(!Number.isFinite(due))continue;
        // Forecast semantics match reviewForecast: overdue cards go in day 0,
        // future cards in their civil study-day bucket, including DST days.
        let offset=offsetByDue.get(card.state.due);
        if(offset===undefined){
          offset=Math.max(0,clock.dayIndex(due)-today);
          offsetByDue.set(card.state.due,offset);
        }
        if(offset<forecastDays.length)forecastDays[offset].due++;
        if(due>now){nextDue=Math.min(nextDue,due);continue}
        total++;
        projectCounts.set(project.slug,(projectCounts.get(project.slug)??0)+1);
        if(note.note.checkpointCode){
          const key=cpKey(project.slug,note.note.checkpointCode);
          checkpointCounts.set(key,(checkpointCounts.get(key)??0)+1);
        }
      }
    }
    // Due counts expire at the next due timestamp; forecast buckets also
    // change at the next civil study-day rollover, even with no new due card.
    const validUntil=Math.min(nextDue,clock.dayStart(today+1));
    return this.dueSnapshotCache={createdAt:now,validUntil,total,
      projectCounts,checkpointCounts,cardCounts,forecastDays};
  }
  constructor(options: DemoOptions = {}) {
    this.now = options.now ?? Date.now;
    this.store = hydrateFixture(
      options.fixture ?? demoSeedFixture,
      this.now(),
      options.timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "UTC",
      { takeOwnership: options.ownedFixture === true },
    );
    // Snapshot before installing either lazy getter: spreading an accessor
    // from its own materialization path would recursively invoke itself.
    const original={...this.store};
    if(options.ownedFixture&&this.store.stressNoteCount!==undefined){
      const store=this.store,template=demoSeedFixture.notes[0];
      if(!template)throw Error('Missing stress card template');
      const count=store.stressNoteCount??0,dueCount=store.stressDueCount??0;
      const clock=studyClock(store.settings.rolloverHour,store.settings.timeZone);
      const today=clock.dayIndex(this.now());
      this.virtualStressDue={overdue:clock.dayStart(today-1),future:clock.dayStart(today+14)};
      // Capture the original object before installing the getter: spreading a
      // lazy store from inside its own getter would recursively materialize it.
      Object.defineProperty(store,'notes',{configurable:true,enumerable:true,get:()=>{
        const notes=makeStressNotes(template,store.projects,count,dueCount);
        const hydrated=hydrateFixture({...original,notes,projects:[],subjects:[],
          checkpoints:[],sources:[],sessions:[],concepts:[],links:[],
          proposals:[],reviews:[]},this.now(),store.settings.timeZone,
          {takeOwnership:true}).notes;
        Object.defineProperty(store,'notes',{value:hydrated,writable:true,
          enumerable:true,configurable:true});
        return hydrated;
      }});
    }
    const sourceTarget=this.store.stressSourceTarget;
    if(options.ownedFixture&&sourceTarget!==undefined){
      this.stressSourceSeedRows=original.sources;
      const store=this.store;
      // Today only needs exact source titles/counts, not 6,000 source objects
      // and their hydrated dates. Keep the authored seed sources untouched.
      const titles=new Map<string,string[]>();
      for(const source of original.sources){
        const values=titles.get(source.projectId)??[];
        values.push(source.title);titles.set(source.projectId,values);
      }
      this.stressSourceSeedTitles=titles;
      Object.defineProperty(store,'sources',{configurable:true,enumerable:true,get:()=>{
        const staging={...original,projects:store.projects,sources:[...original.sources]};
        fillStressSources(staging,sourceTarget,store.seed===2026103102);
        const hydrated=hydrateFixture({...staging,notes:[],checkpoints:[],
          sessions:[],concepts:[],links:[],proposals:[],reviews:[]},
          this.now(),store.settings.timeZone,{takeOwnership:true}).sources;
        Object.defineProperty(store,'sources',{value:hydrated,writable:true,
          enumerable:true,configurable:true});
        return hydrated;
      }});
    }
    if(options.ownedFixture&&this.store.stressAtlasIdeaCount!==undefined){
      const store=this.store,baseConcept=original.concepts[0];
      if(!baseConcept)throw Error('Missing stress Atlas concept template');
      const ideaCount=store.stressAtlasIdeaCount??0,linkCount=store.stressAtlasLinkCount??0;
      const materialize=()=>{
        const staging={...original,subjects:store.subjects,projects:store.projects,
          concepts:original.concepts,links:original.links};
        fillStressAtlas(staging,ideaCount,linkCount,baseConcept);
        Object.defineProperty(store,'concepts',{value:staging.concepts,writable:true,
          enumerable:true,configurable:true});
        Object.defineProperty(store,'links',{value:staging.links,writable:true,
          enumerable:true,configurable:true});
      };
      Object.defineProperty(store,'concepts',{configurable:true,enumerable:true,
        get:()=>{materialize();return store.concepts}});
      Object.defineProperty(store,'links',{configurable:true,enumerable:true,
        get:()=>{materialize();return store.links}});
    }
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private transaction<T>(write: () => T): T {
    const before = clone(this.store);
    try {
      const result=write();
      this.dueSnapshotCache=null;
      return result;
    } catch (error) {
      this.store = before;
      this.dueSnapshotCache=null;
      throw error;
    }
  }
  private project(slug: string) {
    return found(
      this.store.projects.find((p) => p.slug === slug),
      "Project",
    );
  }
  private projectById(id: string) {
    return found(
      this.store.projects.find((p) => p.id === id),
      "Project",
    );
  }
  private subject(id: string): Subject {
    // A v3 draft may exist before the tutor chooses its subject.
    if (!id) return { id: "", name: "Unassigned", glyph: "□", hue: "slate", position: -1 };
    return found(this.store.subjects.find((s) => s.id === id), "Subject");
  }
  private checkpoint(projectId: string, code: string) {
    return found(
      this.store.checkpoints.find(
        (cp) => cp.projectId === projectId && cp.code === code,
      ),
      "Checkpoint",
    );
  }
  private note(no: number) {
    return found(
      this.store.notes.find((n) => n.note.noteNo === no),
      "Card",
    );
  }
  /** Direct Card detail is a single bounded read, not a reason to hydrate
   * 30,000 generated notes. Any write materializes the store and immediately
   * falls back to the normal mutable note, preserving review/comment edits.
   */
  private readOnlyNote(no:number):DemoNote {
    const deferred=typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function';
    const template=demoSeedFixture.notes[0];
    if(!deferred||!this.virtualStressDue||!template||!Number.isSafeInteger(no)||
       no<1||no>(this.store.stressNoteCount??0))return this.note(no);
    const cached=this.virtualCardCache.get(no);
    if(cached)return cached;
    const generated=makeStressNotes(template,this.store.projects,1,
      this.store.stressDueCount??0,no-1);
    const item=this.hydrateVirtualNotes(generated)[0];
    this.virtualCardCache.set(no,item);
    if(this.virtualCardCache.size>12){
      const oldest=this.virtualCardCache.keys().next().value;
      if(oldest!==undefined)this.virtualCardCache.delete(oldest);
    }
    return item;
  }
  /** Generated stress cards follow a project × CP36 cycle. A single
   * checkpoint detail needs only its exact count, not all 30k note objects.
   * After any mutation the note getter disappears and the ordinary mutable
   * store remains authoritative.
   */
  private virtualCheckpointCardCount(project:DemoProject,code:string):number|null {
    if(!this.virtualStressDue ||
       typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get!=='function')
      return null;
    const cp=Number(/^CP([1-9]\d*)$/.exec(code)?.[1]);
    if(!Number.isSafeInteger(cp)||cp<1||cp>36)return 0;
    const projectIndex=this.store.projects.findIndex(p=>p.id===project.id);
    const projectTotal=this.store.projects.length;
    if(projectIndex<0||projectTotal===0)return 0;
    const gcd=(a:number,b:number):number=>{
      while(b){const remainder=a%b;a=b;b=remainder}
      return a;
    };
    const period=projectTotal/gcd(projectTotal,36)*36;
    const total=this.store.stressNoteCount??0;
    let count=0;
    for(let i=projectIndex;i<period;i+=projectTotal){
      if(i%36!==cp-1||i>=total)continue;
      count+=Math.floor((total-1-i)/period)+1;
    }
    return count;
  }
  /** A project detail requests only its own 30/100 sources, not all 6,000
   * generated rows. The full source getter remains available for source-wide
   * routes and becomes authoritative after any source mutation.
   */
  private projectSources(project:DemoProject):DemoSource[]{
    const seeds=this.stressSourceSeedRows;
    const deferred=typeof Object.getOwnPropertyDescriptor(this.store,'sources')?.get==='function';
    if(!deferred||!seeds)return this.store.sources.filter(s=>s.projectId===project.id);
    const first=seeds.find(s=>s.projectId===this.store.projects[0]?.id);
    const projectIndex=this.store.projects.findIndex(p=>p.id===project.id);
    if(!first||projectIndex<0)return this.store.sources.filter(s=>s.projectId===project.id);
    const existing=seeds.filter(s=>s.projectId===project.id);
    const rows=makeStressProjectSources(first,existing,project,projectIndex,
      this.store.projects.length,this.store.stressSourceTarget??0,
      this.store.seed===2026103102);
    const staging:DemoStore={
      version:1,seed:this.store.seed,settings:{...this.store.settings},
      styles:[],subjects:[],projects:[],checkpoints:[],sources:rows,
      sessions:[],notes:[],reviews:[],proposals:[],concepts:[],links:[],
      misconceptions:[],checkpointEvents:[],
      stressReviewCount:this.store.stressReviewCount,
    };
    return hydrateFixture(staging,this.now(),this.store.settings.timeZone,
      {takeOwnership:true}).sources;
  }
  private proposal(id: string) {
    return found(
      this.store.proposals.find((p) => p.id === id),
      "Proposal",
    );
  }
  private projectValue(p: DemoProject): Project {
    const { lastActivityAt, ...value } = p;
    return clone(value);
  }
  private cpUi(
    cp: DemoCheckpoint,
    seen = new Set<string>(),
  ): CheckpointView["ui"] {
    if (cp.proposed) return "proposed";
    if (seen.has(cp.id)) return "locked";
    const next = new Set(seen).add(cp.id);
    return checkpointUi(
      cp,
      cp.prereqs.map((code) =>
        this.cpUi(this.checkpoint(cp.projectId, code), next),
      ),
      studyDay(
        this.now(),
        this.store.settings.timeZone,
        this.store.settings.rolloverHour,
      ),
    );
  }
  private item(
    note: DemoNote,
    card: DemoNote["cards"][number],
    project: DemoProject,
    cp: DemoCheckpoint | null,
    copyState = true,
  ): ReviewItem {
    return {
      cardId: card.id,
      noteId: note.note.noteId,
      noteNo: note.note.noteNo,
      ord: card.ord,
      type: note.note.type,
      kind: note.note.kind,
      front: note.note.front,
      back: note.note.back,
      projectSlug: project.slug,
      glyph: this.displaySubject(project.subjectId).glyph,
      checkpointCode: note.note.checkpointCode,
      checkpointTitle: cp?.title ?? null,
      sessionNumber: note.note.sessionNumber,
      sourceShort: note.note.sourceShort,
      pageLabel: note.note.pageLabel,
      state: copyState ? clone(card.state) : card.state,
    };
  }
  /** Resolve only requested private synthetic notes; never spread the store
   * because its unrelated sources, Atlas and notes are lazy accessors.
   */
  private hydrateVirtualNotes(notes:DemoNote[]):DemoNote[]{
    const staging:DemoStore={
      version:1,seed:this.store.seed,settings:{...this.store.settings},
      styles:[],subjects:[],projects:[],checkpoints:[],sources:[],
      sessions:[],notes,reviews:[],proposals:[],concepts:[],links:[],
      misconceptions:[],checkpointEvents:[],
      stressReviewCount:this.store.stressReviewCount,
    };
    return hydrateFixture(staging,this.now(),
      this.store.settings.timeZone,{takeOwnership:true}).notes;
  }
  /** Review needs at most today's due synthetic cards. Keep the 26k future
   * stress notes and unrelated Atlas graph virtual until their own routes ask
   * for them. This fast path applies only to the private, unedited generated
   * fixture while its future cohort is not due; all other cases use the full
   * authored store and exactly the same daily-queue logic.
   */
  private reviewNotes(): DemoNote[] {
    const deferred=typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function';
    const template=demoSeedFixture.notes[0];
    if(!deferred||!this.virtualStressDue||this.now()>=this.virtualStressDue.future||
       !template||template.cards[0]?.state.state!==2)return this.store.notes;
    // The virtual backlog may contain 4,000 overdue cards, but dueToday
    // admits at most reviewsPerDay (200 in S/X). All generated cards are
    // single-card mature notes with the same due date, so the stable
    // earliest-due order is exactly the first dailyShare notes. Materializing
    // the other 3,800 only delays the first real Review-run card. Backlog
    // totals remain sourced from the independent full due snapshot.
    const dueCount=this.store.stressDueCount??0;
    const dailyShare=Math.min(dueCount,Math.max(0,this.store.settings.reviewsPerDay));
    if(!this.virtualReviewNotes||this.virtualReviewNotes.length!==dailyShare){
      const generatedAt=performance.now();
      const notes=makeStressNotes(template,this.store.projects,dailyShare,dueCount);
      const hydratedAt=performance.now();
      this.virtualReviewNotes=this.hydrateVirtualNotes(notes);
      performance.measure('review-run-demo-virtual-generate',{start:generatedAt,end:hydratedAt});
      performance.measure('review-run-demo-virtual-hydrate',{start:hydratedAt,end:performance.now()});
    }
    return this.virtualReviewNotes;
  }
  private allItems(include?: (state: CardState) => boolean, notes?: readonly DemoNote[], copyState = true) {
    // The extreme fixture has 30,000 cards and 6,000 checkpoints. Resolve
    // identities once instead of scanning all checkpoints for every card.
    const projects = new Map<string, DemoProject>(this.store.projects
      .filter(p => p.status !== "archived" && !p.system)
      .map(p => [p.id, p] as const));
    const sourceNotes=notes??this.store.notes;
    // A cold private Review-run read supplies only today's bounded cohort.
    // Resolve titles for those notes, not all 6,000 unrelated checkpoints.
    // Full-table callers still receive the original complete index.
    const wantedCheckpointKeys=notes?new Set<string>():null;
    if(notes&&wantedCheckpointKeys)for(const note of notes){
      if(note.note.checkpointCode)
        wantedCheckpointKeys.add(cpKey(note.projectId,note.note.checkpointCode));
    }
    const checkpoints=new Map<string,DemoCheckpoint>();
    if(!wantedCheckpointKeys||wantedCheckpointKeys.size>0)
      for(const cp of this.store.checkpoints){
        const key=cpKey(cp.projectId,cp.code);
        if(wantedCheckpointKeys&&!wantedCheckpointKeys.has(key))continue;
        checkpoints.set(key,cp);
      }
    return sourceNotes
      .filter(n => n.note.status === "active" && projects.has(n.projectId))
      .flatMap(n => {
        const project = projects.get(n.projectId)!;
        const cp = n.note.checkpointCode
          ? checkpoints.get(cpKey(n.projectId, n.note.checkpointCode)) ?? null
          : null;
        return n.cards.filter(card => !include || include(card.state))
          .map(card => this.item(n, card, project, cp, copyState));
      });
  }
  /** The due badge and deck counts represent the full backlog, not the daily queue. */
  private backlog(): ReviewItem[] {
    const now = this.now();
    return this.allItems().filter(item => item.state.state > 0 && Date.parse(item.state.due) <= now);
  }
  private eligible(): ReviewItem[] {
    const {start,end} = studyDayBounds(
      this.now(),
      this.store.settings.timeZone,
      this.store.settings.rolloverHour,
    );
    const today = this.store.reviews.filter(
      (r) =>
        !r.undoneAt &&
        Date.parse(r.reviewedAt) >= start &&
        Date.parse(r.reviewedAt) <= this.now(),
    );
    // dueToday never selects a future scheduled card. Avoid constructing
    // 26,000 cloned ReviewItems only to discard them in the 30k-card fixture.
    // Keep every new card, plus every due/learning card before study-day end.
    const notes=this.reviewNotes();
    // Private generated stress notes cannot be mutated by the queue read.
    // getReviewItems defensively clones its final response, so cloning all
    // 4,000 intermediate CardState objects here only delays cold Review-run.
    const privateVirtual=notes===this.virtualReviewNotes &&
      typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function';
    return dueToday(this.allItems(state => state.state === 0 ||
      this.dueTime(state.due) < end,notes,!privateVirtual), this.store.settings, {
      now: this.now(),
      answeredToday: today.length,
      newAnsweredToday: today.filter((r) => r.stateBefore === 0).length,
    });
  }
  private cpView(
    cp: DemoCheckpoint,
    eligible = this.eligible(),
  ): CheckpointView {
    const project = this.projectById(cp.projectId);
    return {
      id: cp.id,
      code: cp.code,
      title: cp.title,
      position: cp.position,
      stage: cp.stage ?? null,
      dueOn: cp.dueOn ?? null,
      demonstratedAt: cp.demonstratedAt ?? null,
      ui: this.cpUi(cp),
      currentStep: cp.currentStep,
      stepsTotal: cp.steps.length,
      recheckDue: cp.recheckDue,
      dueCards: eligible.filter(
        (c) => c.projectSlug === project.slug && c.checkpointCode === cp.code,
      ).length,
    };
  }
  /** Generate one stress session on demand; the UI never needs 60k hydrated rows. */
  private virtualStressSession(project: DemoProject, number: number): DemoSession {
    const count = this.store.stressSessionCount ?? 0;
    if (!Number.isInteger(number) || number < 1 || number > count) invalid("Invalid stress session number");
    const projectIndex = this.store.projects.findIndex(p => p.id === project.id);
    const template = stressSessionTemplate;
    const checkpointCode = `CP${((number - 1) % 36) + 1}`;
    const offset = (number - 1) % 90;
    const now = this.now();
    const today = this.stressDayStart ??= studyDayBounds(now, this.store.settings.timeZone, this.store.settings.rolloverHour).start;
    const start = today - offset * DAY;
    // The current study day may be only minutes old; never place a synthetic
    // completed session in the future. Match the original @day 0.3/0.6 tokens.
    const span = offset === 0 ? Math.max(0, now - start) : DAY;
    return {
      ...template, id: `stress-session-${projectIndex}-${number}`, projectId: project.id,
      number, checkpointCode, goal: `Study session ${number} for ${project.title}`,
      state: "ended", startedAt: new Date(start + span * 0.3).toISOString(),
      lastActivityAt: new Date(start + span * 0.6).toISOString(), events: [],
    };
  }
  private sessionsForProject(project: DemoProject): DemoSession[] {
    if (this.store.stressSessionCount) return Array.from(
      {length:this.store.stressSessionCount}, (_,i) => this.virtualStressSession(project,i+1));
    return this.store.sessions.filter(s => s.projectId === project.id);
  }
  /** Direct checkpoint details only need sessions in the CP36 residue,
   * not 1,000 generated sessions for the whole project.
   */
  private checkpointSessions(project:DemoProject,code:string):DemoSession[]{
    if(!this.store.stressSessionCount)
      return this.store.sessions.filter(s=>s.projectId===project.id&&s.checkpointCode===code);
    const cp=Number(/^CP([1-9]\d*)$/.exec(code)?.[1]);
    if(!Number.isSafeInteger(cp)||cp<1||cp>36)return [];
    const result:DemoSession[]=[];
    for(let number=cp;number<=this.store.stressSessionCount;number+=36)
      result.push(this.virtualStressSession(project,number));
    return result;
  }
  /** Preserve checkpoint evidence from the two representative long histories. */
  private stressCheckpointEvents(project: DemoProject, code: string): DemoSession["events"] {
    if (!this.store.stressSessionCount) return [];
    if (this.store.sessions.some(s => s.projectId === project.id && s.events.some(e => e.checkpointCode === code))) return [];
    const index = this.store.projects.findIndex(p => p.id === project.id);
    const number = index === 0 && code === "CP7" ? 7
      : index === this.store.projects.length - 1 && code === "CP1" ? 1 : null;
    if (!number) return [];
    return stressSessionEvents(this.virtualStressSession(project, number),
      this.store.seed === 2026103102 ? 400 : 150);
  }
  private sessionSummary(s: DemoSession): SessionSummary {
    return {
      id: s.id,
      projectSlug: this.projectById(s.projectId).slug,
      number: s.number,
      goal: s.goal,
      checkpointCode: s.checkpointCode,
      client: s.client,
      display: sessionDisplay(s, this.now()),
      goalMet: s.goalMet,
      startedAt: s.startedAt,
      lastActivityAt: s.lastActivityAt,
      minutes: s.minutes,
    };
  }
  private displaySubject(id: string): Subject {
    return id ? this.subject(id) : { id: "", name: "Unassigned", glyph: "·", hue: "slate", position: 999 };
  }
  private summary(p: DemoProject, index?: SummaryIndex): ProjectSummary {
    const cps = index ? index.checkpoints.get(p.id) ?? [] :
      this.store.checkpoints.filter(cp => cp.projectId === p.id);
    // Summary progress needs only demonstrated/proposed status, not the full
    // recursive prerequisite UI and daily due-card queue for each checkpoint.
    // checkpointUi() maps every demonstrated checkpoint to done or revisit;
    // both count as done, and proposed checkpoints are excluded.
    const approved = cps.filter(cp => !cp.proposed);
    const progress = {
      done: approved.filter(cp => cp.status === "demonstrated").length,
      total: approved.length,
    };
    const current = cps.find(cp => cp.status === "in_progress");
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      subject: clone(this.displaySubject(p.subjectId)),
      status: p.status,
      pinned: p.pinned ?? false,
      system: p.system ?? false,
      targetDate: p.targetDate ?? null,
      targetLabel: p.targetLabel ?? null,
      done: progress.done,
      total: progress.total,
      current: current
        ? {
            code: current.code,
            title: current.title,
            step: current.currentStep,
            stepsTotal: current.steps.length,
          }
        : null,
      lastActivityAt: p.lastActivityAt,
      cardsCount: index ? index.cards.get(p.id) ?? 0 :
        this.store.notes.filter(n => n.projectId === p.id && n.note.status !== "deleted")
          .reduce((n,note) => n + note.cards.length,0),
      sessionsCount: this.store.stressSessionCount ?? (index ? index.sessions.get(p.id) ?? 0 :
        this.store.sessions.filter(s => s.projectId === p.id && s.state === "ended").length),
      sourcesCount: index ? index.sourceTitles.get(p.id)?.length ?? 0 :
        this.store.sources.filter(s => s.projectId === p.id).length,
      sourceTitles: index ? [...(index.sourceTitles.get(p.id) ?? [])] :
        this.store.sources.filter(s => s.projectId === p.id).map(source => source.title),
    };
  }
  async getAuth() {
    return { email: "demo@lemma.app" };
  }
  async signIn() {}
  async signOut() {}
  async bootstrap() {
    return this.getSettings();
  }
  async getSettings() {
    return clone(this.store.settings);
  }
  async updateSettings(patch: SettingsPatch) {
    return this.transaction(() => {
      keys(patch, [
        "desiredRetention",
        "newPerDay",
        "reviewsPerDay",
        "learnSteps",
        "relearnSteps",
        "rolloverHour",
        "maxIntervalDays",
        "fuzz",
        "loadBalance",
        "learnAheadMinutes",
        "fsrsWeights",
        "fsrsTunedAt",
        "macros",
        "defaultStyle",
        "tutorRules",
        "mixDecks",
        "preferredChat",
        "timeZone",
      ]);
      const value = { ...this.store.settings, ...clone(patch) };
      if (
        value.desiredRetention < 0.8 ||
        value.desiredRetention > 0.97 ||
        !Number.isFinite(value.desiredRetention)
      )
        invalid("Target recall must be 80–97%");
      for (const [n, max] of [
        [value.newPerDay, 200],
        [value.reviewsPerDay, 2000],
        [value.rolloverHour, 23],
      ] as const)
        if (!Number.isInteger(n) || n < 0 || n > max)
          invalid("Invalid daily limit or rollover hour");
      if (
        value.fsrsWeights &&
        (value.fsrsWeights.length !== 21 ||
          value.fsrsWeights.some((w) => !Number.isFinite(w)))
      )
        invalid("FSRS needs 21 weights");
      if (!["claude", "chatgpt"].includes(value.preferredChat))
        invalid("Unknown chat app");
      found(
        this.store.styles.find((s) => s.key === value.defaultStyle),
        "Style",
      );
      try {
        new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
      } catch {
        invalid("Invalid time zone");
      }
      if (
        typeof value.learnSteps !== "string" ||
        typeof value.relearnSteps !== "string" ||
        !parseSteps(value.learnSteps) ||
        !parseSteps(value.relearnSteps)
      )
        invalid("Invalid learning steps");
      if (
        !Number.isInteger(value.maxIntervalDays) ||
        !Number.isInteger(value.learnAheadMinutes) ||
        value.maxIntervalDays < 1 ||
        value.learnAheadMinutes < 0
      )
        invalid("Invalid interval");
      this.store.settings = value;
      return clone(value);
    });
  }
  async rotateConnectorSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    this.store.settings.connectorUrl =
      "https://demo.lemma.invalid/functions/v1/mcp/" +
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return this.getSettings();
  }
  async listStyles() {
    return clone(this.store.styles).sort((a, b) => a.position - b.position);
  }
  async updateStyle(key: string, patch: StylePatch) {
    return this.transaction(() => {
      keys(patch, ["name", "instructions"]);
      const style = found(
        this.store.styles.find((s) => s.key === key),
        "Style",
      );
      if (patch.name !== undefined) text(patch.name, 1, 24, "Name");
      if (patch.instructions !== undefined)
        text(patch.instructions, 1, 500, "Instructions");
      Object.assign(style, patch);
      return clone(style);
    });
  }
  async listSubjects() {
    return clone(this.store.subjects).sort((a, b) => a.position - b.position);
  }
  async createSubject(input: CreateSubjectInput) {
    return this.transaction(() => {
      text(input.name, 1, 40, "Subject");
      text(input.glyph, 1, 2, "Glyph");
      if (
        !["amber", "violet", "cyan", "rose", "lime", "slate"].includes(
          input.hue,
        )
      )
        invalid("Unknown hue");
      if (
        this.store.subjects.some(
          (s) => s.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        conflict("Subject already exists");
      const subject = {
        id: crypto.randomUUID(),
        ...input,
        position:
          Math.max(-1, ...this.store.subjects.map((s) => s.position)) + 1,
      };
      this.store.subjects.push(subject);
      return clone(subject);
    });
  }
  async updateSubject(id: string, patch: SubjectPatch): Promise<Subject> {
    return this.transaction(() => {
      keys(patch, ["name", "glyph", "position"]);
      const subject = this.subject(id);
      if (!subject.id) invalid("Cannot edit the unassigned placeholder");
      if (patch.name !== undefined) {
        text(patch.name.trim(), 1, 40, "Subject");
        if (this.store.subjects.some(s => s.id !== id && s.name.toLowerCase() === patch.name!.trim().toLowerCase()))
          conflict("Subject already exists");
        patch = {...patch, name: patch.name.trim()};
      }
      if (patch.glyph !== undefined) text(patch.glyph, 1, 2, "Glyph");
      if (patch.position !== undefined && (!Number.isFinite(patch.position) || patch.position < 0))
        invalid("Invalid subject position");
      const {position, ...fields} = patch;
      Object.assign(subject, fields);
      if (position !== undefined) {
        const others = this.store.subjects.filter(s => s.id !== id)
          .sort((a,b) => a.position - b.position);
        const index = Math.min(others.length, Math.floor(position));
        others.splice(index, 0, subject);
        others.forEach((s, i) => { s.position = i; });
      }
      return clone(subject);
    });
  }
  async mergeSubjects(sourceId: string, targetId: string): Promise<void> {
    this.transaction(() => {
      if (sourceId === targetId) invalid("Choose two different subjects");
      const source = this.subject(sourceId), target = this.subject(targetId);
      if (!source.id || !target.id) invalid("Unassigned is not a subject");
      for (const project of this.store.projects)
        if (project.subjectId === sourceId) project.subjectId = targetId;
      const used = new Set(this.store.concepts.filter(c => c.subjectId === targetId).map(c => c.slug));
      for (const concept of this.store.concepts.filter(c => c.subjectId === sourceId)) {
        let slug = concept.slug, n = 2;
        while (used.has(slug)) slug = concept.slug + "-" + n++;
        used.add(slug);
        concept.slug = slug;
        concept.subjectId = targetId;
      }
      this.store.subjects = this.store.subjects.filter(s => s.id !== sourceId);
      this.store.subjects.sort((a,b) => a.position-b.position)
        .forEach((s,i) => { s.position = i; });
    });
  }
  async listProjects(withDueCounts=false) {
    // ST-0: scanning 30,000 cards and 6,000 checkpoints separately for each
    // of 60 projects creates millions of redundant reads on the cold Today.
    // Direct Paths needs exact card counts but not 30,000 rich notes.
    // The private generated fixture represents every synthetic card in its
    // due snapshot; ordinary mutable stores keep their exact notes scan.
    const virtualCards=this.virtualStressDue!==null&&
      typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function';
    const index:SummaryIndex={
      checkpoints:new Map(),cards:withDueCounts||virtualCards?this.dueSnapshot().cardCounts:new Map(),sessions:new Map(),sourceTitles:new Map(),
    };
    for(const cp of this.store.checkpoints){
      const rows=index.checkpoints.get(cp.projectId)??[];
      rows.push(cp);index.checkpoints.set(cp.projectId,rows);
    }
    // A standalone Projects read should not pay for due-card scheduling.
    if(!withDueCounts&&!virtualCards)for(const note of this.store.notes)if(note.note.status!=="deleted")
      index.cards.set(note.projectId,(index.cards.get(note.projectId)??0)+note.cards.length);
    for(const session of this.store.sessions)if(session.state==="ended")
      index.sessions.set(session.projectId,(index.sessions.get(session.projectId)??0)+1);
    const virtualSources=this.stressSourceSeedTitles&&
      typeof Object.getOwnPropertyDescriptor(this.store,'sources')?.get==='function';
    if(virtualSources){
      // The generated source titles follow a deterministic per-project index.
      // Reproduce the complete 100/30-title summaries without forcing the
      // source getter. Once a source route materializes or edits them, use
      // the actual source records instead.
      const target=this.store.stressSourceTarget??0;
      for(const project of this.store.projects){
        const titles=[...(this.stressSourceSeedTitles!.get(project.id)??[])];
        for(let i=titles.length;i<target;i++)
          titles.push('Source '+(i+1)+': mathematical notes and proofs');
        index.sourceTitles.set(project.id,titles);
      }
    }else for(const source of this.store.sources){
      const titles=index.sourceTitles.get(source.projectId)??[];
      titles.push(source.title);index.sourceTitles.set(source.projectId,titles);
    }
    return this.store.projects
      .filter(p => !p.system)
      .map(p => this.summary(p,index))
      .sort(
        (a, b) =>
          Date.parse(b.lastActivityAt ?? "1970-01-01") -
          Date.parse(a.lastActivityAt ?? "1970-01-01"),
      );
  }
  private freeSlug(base: string) {
    let slug = base,
      n = 2;
    while (this.store.projects.some((p) => p.slug === slug)) {
      const suffix = `-${n++}`;
      slug = base.slice(0, 40 - suffix.length) + suffix;
    }
    return slug;
  }
  async createProject(input: NewProjectInput) {
    return this.transaction(() => {
      text(input.title, 1, 80, "Title");
      text(input.goal, 1, 1200, "Goal");
      this.subject(input.subjectId);
      found(
        this.store.styles.find((s) => s.key === input.style),
        "Style",
      );
      const base = input.slug ?? slugify(input.title);
      if (
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(base) ||
        base.length < 2 ||
        base.length > 40
      )
        invalid("Invalid project slug");
      const project: DemoProject = {
        id: crypto.randomUUID(),
        slug: this.freeSlug(base),
        title: input.title,
        goal: input.goal,
        style: input.style,
        status: "planning",
        subjectId: input.subjectId,
        createdAt: this.iso(),
        lastActivityAt: null,
      };
      this.store.projects.push(project);
      return this.projectValue(project);
    });
  }
  async createProjectDraft(input: { title: string; sources?: File[] }): Promise<Project> {
    text(input.title?.trim(), 2, 80, "Title");
    const title = input.title.trim();
    const base = slugify(title);
    if (base.length < 2) invalid("Invalid project slug");
    const project = this.transaction(() => {
      const draft: DemoProject = {
        id: crypto.randomUUID(),
        slug: this.freeSlug(base.slice(0, 40)),
        title,
        goal: "",
        style: this.store.settings.defaultStyle,
        status: "planning",
        subjectId: "",
        pinned: false,
        createdAt: this.iso(),
        lastActivityAt: null,
      };
      this.store.projects.push(draft);
      return this.projectValue(draft);
    });
    for (const file of input.sources ?? []) await this.addSource(project.id, file, () => {});
    return project;
  }
  private planHistory(project: DemoProject): PlanRevision[] {
    const approvals = this.store.proposals
      .filter(p => p.projectSlug === project.slug && p.status === "approved" &&
        (p.kind === "plan" || p.kind === "plan_change"))
      .sort((a,b) => Date.parse(a.approvedAt ?? a.createdAt) - Date.parse(b.approvedAt ?? b.createdAt));
    const hasInitial = this.store.checkpoints.some(cp => cp.projectId === project.id);
    const baseline: PlanRevision[] = hasInitial && !approvals.some(p => p.kind === "plan")
      ? [{revision: 1, approvedAt: project.createdAt, summary: "Initial study plan", proposalId: null}]
      : [];
    return [...baseline, ...approvals.map(p => ({
      revision: 0,
      approvedAt: p.approvedAt ?? p.createdAt,
      summary: p.reason?.trim() || (p.kind === "plan" ? "Initial study plan" : "Plan amendment"),
      proposalId: p.id,
    }))].map((entry, index) => ({...entry, revision: index + 1})).reverse();
  }
  async listPlanRevisions(slug: string): Promise<PlanRevision[]> {
    return clone(this.planHistory(this.project(slug)));
  }
  async updateSource(id: string, patch: SourcePatch): Promise<Source> {
    return this.transaction(() => {
      keys(patch, ["title", "kind"]);
      const source = found(this.store.sources.find((s) => s.id === id), "Source");
      if (patch.title !== undefined) text(patch.title, 1, 120, "Source title");
      if (patch.kind !== undefined && !["book", "notes", "slides", "problems", "syllabus", "exam", "other"].includes(patch.kind))
        invalid("Unknown source kind");
      Object.assign(source, patch);
      const { pages, error, ...value } = source;
      return clone(value);
    });
  }
  async updateProject(id: string, patch: ProjectPatch) {
    return this.transaction(() => {
      keys(patch, ["title", "goal", "style", "status", "subjectId", "pinned"]);
      const p = this.projectById(id);
      if (patch.title !== undefined) text(patch.title, 1, 80, "Title");
      if (patch.goal !== undefined) text(patch.goal, 1, 1200, "Goal");
      if (patch.subjectId) this.subject(patch.subjectId);
      if (patch.style)
        found(
          this.store.styles.find((s) => s.key === patch.style),
          "Style",
        );
      if (
        patch.status &&
        !["planning", "active", "paused", "done", "archived"].includes(patch.status)
      )
        invalid("Unknown project status");
      if (patch.pinned && !p.pinned && this.store.projects.filter(x => x.pinned && x.status !== "archived").length >= 4)
        conflict("At most four projects can be pinned");
      Object.assign(p, patch);
      if (p.status === "archived") p.pinned = false;
      return this.projectValue(p);
    });
  }
  private code(
    projectId: string,
    after?: string,
    rows = this.store.checkpoints,
  ): string {
    const used = new Set(
      rows.filter((cp) => cp.projectId === projectId).map((cp) => cp.code),
    );
    if (after) {
      const stem =
        after.match(/^CP\d+/)?.[0] ?? invalid("Invalid insertion point");
      for (let i = 97; i <= 122; i++) {
        const code = stem + String.fromCharCode(i);
        if (!used.has(code)) return code;
      }
      invalid("No free checkpoint suffix");
    }
    return (
      "CP" +
      (Math.max(
        0,
        ...[...used].map((code) => Number(code.match(/^CP(\d+)/)?.[1] ?? 0)),
      ) +
        1)
    );
  }
  private position(
    projectId: string,
    after?: string,
    moving?: string,
    rows = this.store.checkpoints,
  ): number {
    const cps = rows
      .filter((cp) => cp.projectId === projectId && cp.id !== moving)
      .sort((a, b) => a.position - b.position);
    if (!after) return (cps.at(-1)?.position ?? 0) + 10;
    const index = cps.findIndex((cp) => cp.code === after);
    if (index < 0) invalid("Unknown insertion point");
    if (!cps[index + 1]) return cps[index].position + 10;
    if (cps[index + 1].position - cps[index].position < 0.001) {
      cps.forEach((cp, i) => {
        cp.position = (i + 1) * 10;
      });
      return this.position(projectId, after, moving, rows);
    }
    return (cps[index].position + cps[index + 1].position) / 2;
  }
  private proposed(p: DemoProject): DemoCheckpoint[] {
    const rows = clone(this.store.checkpoints),
      result: DemoCheckpoint[] = [];
    for (const proposal of this.store.proposals.filter(
      (v) => v.status === "pending" && v.projectSlug === p.slug && v.planChange,
    ))
      for (const [i, op] of proposal.planChange!.ops.entries())
        if (op.op === "add") {
          const cp: DemoCheckpoint = {
            id: `proposed-${proposal.id}-${i}`,
            projectId: p.id,
            code: op.code ?? this.code(p.id, op.after, rows),
            title: op.title,
            position: this.position(p.id, op.after, undefined, rows),
            stage: op.stage ?? rows.find(cp=>cp.projectId===p.id&&cp.code===op.after)?.stage ?? undefined,
            objective: op.objective,
            criterion: op.criterion,
            steps: [...op.steps],
            pages: op.pages ?? null,
            sourceShort: op.source ?? null,
            status: "not_started",
            currentStep: 0,
            recheckLevel: 0,
            recheckDue: null,
            recheckPrompt: op.recheck_prompt ?? null,
            needsRevisit: false,
            prereqs: op.prereqs ?? [],
            conceptIds: [],
            proposed: true,
          };
          rows.push(cp);
          result.push(cp);
        }
    return result;
  }
  async getProject(slug: string): Promise<ProjectDetail> {
    const p = this.project(slug);
    // A direct project route needs one project's full detail, not all 30k
    // generated note objects. Reuse the exact bounded Paths summary while
    // the private S/X note collection is still virtual. Once a write
    // materializes notes, retain the ordinary mutable-store summary path.
    const virtualNotes = this.virtualStressDue !== null &&
      typeof Object.getOwnPropertyDescriptor(this.store, 'notes')?.get === 'function';
    const summary = virtualNotes
      ? (await this.listProjects()).find(row => row.id === p.id) ?? this.summary(p)
      : this.summary(p);
    const eligible = this.eligible();
    return {
      project: this.projectValue(p),
      subject: clone(this.displaySubject(p.subjectId)),
      checkpoints: [
        ...this.store.checkpoints.filter((cp) => cp.projectId === p.id),
        ...this.proposed(p),
      ]
        .sort((a, b) => a.position - b.position)
        .map((cp) => this.cpView(cp, eligible)),
      done: summary.done,
      total: summary.total,
      planRevisions: clone(this.planHistory(p)),
      sources: this.projectSources(p)
        .map(({ pages, error, ...source }) => clone(source)),
      sessions: await this.listSessions(slug),
      pendingProposals: this.store.proposals.filter(
        (v) => v.projectSlug === slug && v.status === "pending",
      ).length,
    };
  }
  async getCheckpoint(slug: string, code: string): Promise<CheckpointDetail> {
    const project = this.project(slug),
      cp = found(
        [...this.store.checkpoints, ...this.proposed(project)].find(
          (cp) => cp.projectId === project.id && cp.code === code,
        ),
        "Checkpoint",
      );
    const sessions = this.checkpointSessions(project,code);
    return {
      view: this.cpView(cp),
      objective: cp.objective,
      criterion: cp.criterion,
      steps: [...cp.steps],
      pages: cp.pages,
      sourceShort: cp.sourceShort,
      prereqs: [...cp.prereqs],
      concepts: cp.conceptIds.map((id) => {
        const c = found(
          this.store.concepts.find((c) => c.id === id),
          "Concept",
        );
        return { slug: c.slug, name: c.name };
      }),
      recheckPrompt: cp.recheckPrompt,
      events: clone(
        [...this.store.sessions
          .filter((s) => s.projectId === project.id)
          .flatMap((s) => s.events), ...this.stressCheckpointEvents(project, code)]
          .filter((e) => e.checkpointCode === code)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, 20),
      ),
      cardsCount: this.virtualCheckpointCardCount(project,code) ??
        this.store.notes
          .filter(
            (n) =>
              n.projectId === project.id &&
              n.note.checkpointCode === code &&
              n.note.status !== "deleted",
          )
          .reduce((n, note) => n + note.cards.length, 0),
      sessions: sessions
        .map((s) => this.sessionSummary(s))
        .sort(
          (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
        ),
    };
  }
  async getHome(): Promise<HomeSummary> {
    const queryStarted=this.virtualStressDue?performance.now():0;
    const projects = (await this.listProjects(true)).filter(p => p.status !== "archived"),
      open = this.store.sessions
        .filter((s) => s.state === "open" && this.projectById(s.projectId).status !== "archived" && !this.projectById(s.projectId).system)
        .sort(
          (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
        )[0];
    const p = open
      ? this.projectById(open.projectId)
      : projects[0]
        ? this.project(projects[0].slug)
        : null;
    const cp = p
      ? open?.checkpointCode
        ? this.checkpoint(p.id, open.checkpointCode)
        : this.store.checkpoints.find(
            (cp) => cp.projectId === p.id && cp.status === "in_progress",
          )
      : null;
    // Diagnostic-only User Timing: measure the real data query separately
    // from browser navigation, React commit and screenshot readiness waits.
    if(this.virtualStressDue)performance.measure('lemma-stress-home-query',
      {start:queryStarted,end:performance.now()});
    return {
      resume:
        p && cp
          ? {
              projectSlug: p.slug,
              projectTitle: p.title,
              glyph: this.displaySubject(p.subjectId).glyph,
              checkpointCode: cp.code,
              checkpointTitle: cp.title,
              step: open?.resumeStep ?? cp.currentStep,
              stepsTotal: cp.steps.length,
              question: open?.resumeQuestion ?? null,
              objective: cp.objective,
              pausedAt: open?.lastActivityAt ?? p.lastActivityAt,
              sessionNumber: open?.number ?? null,
            }
          : null,
      // Today needs a count, not 30,000 hydrated ReviewItem objects.
      // Keep exactly the backlog() predicate (active, owner-visible, due).
      due: this.dueSnapshot().total,
      pendingProposals: this.store.proposals.filter(
        (p) => p.status === "pending",
      ).length,
      projects,
    };
  }
  async listSessions(slug?: string) {
    const id = slug ? this.project(slug).id : null;
    const sessions = this.store.stressSessionCount
      ? (id ? this.sessionsForProject(this.project(slug!))
        : this.store.projects.flatMap(project => this.sessionsForProject(project)))
      : this.store.sessions.filter(s => !id || s.projectId === id);
    return sessions
      .map((s) => this.sessionSummary(s))
      .sort(
        (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
      );
  }
  async getSession(slug: string, number: number): Promise<SessionDetail> {
    const p = this.project(slug),
      s = found(
        this.store.stressSessionCount
          ? (this.store.sessions.find(s => s.projectId === p.id && s.number === number)
            ?? this.virtualStressSession(p,number))
          : this.store.sessions.find(s => s.projectId === p.id && s.number === number),
        "Session",
      ),
      proposals = this.store.proposals.filter(
        (v) =>
          v.projectSlug === slug &&
          v.sessionNumber === number &&
          v.status === "pending",
      );
    return {
      summary: this.sessionSummary(s),
      styleName: found(
        this.store.styles.find((v) => v.key === s.style),
        "Style",
      ).name,
      summaryText: s.summaryText,
      resumeQuestion: s.resumeQuestion,
      resumeStep: s.resumeStep,
      events: clone(s.events.length ? s.events : s.id.startsWith("stress-session-")
        ? stressSessionEvents(s, this.store.seed === 2026103102 ? 400 : 150) : []),
      misconceptions: clone(
        this.store.misconceptions.filter((m) => m.projectId === p.id),
      ),
      cards: [
        // Generated S/X notes always have sessionId=null. Do not hydrate
        // 30,000 unrelated notes for one synthetic session; authored edits
        // materialize the note store and use the ordinary filtered path.
        ...(this.virtualStressDue &&
          typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function'
          ? []
          : this.store.notes
              .filter((n) => n.sessionId === s.id && n.note.status !== "deleted")
              .map((n) => ({
                noteNo: n.note.noteNo,
                front: n.note.front,
                state: "active" as const,
              }))),
        ...proposals
          .filter((p) => p.kind === "card" && p.card)
          .map((p) => ({
            noteNo: 0,
            front: p.card!.front,
            state: "pending" as const,
          })),
      ],
      pendingProposals: {
        cards: proposals.filter(
          (p) => p.kind === "card" || p.kind === "card_edit",
        ).length,
        planChanges: proposals.filter(
          (p) => p.kind === "plan" || p.kind === "plan_change",
        ).length,
      },
      pages: s.pages,
    };
  }
  private proposalValue(p: DemoProposal): Proposal {
    const { status, ...value } = clone(p);
    if (value.cardEdit) {
      const note = this.store.notes.find(
        (n) => n.note.noteNo === value.cardEdit!.note_no,
      );
      if (note) {
        value.cardEdit.current = {
          front: note.note.front,
          back: note.note.back,
        };
        value.cardEdit.comments = clone(note.comments);
      }
    }
    return value;
  }
  async listProposals() {
    return this.store.proposals
      .filter((p) => p.status === "pending")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((p) => this.proposalValue(p));
  }
  async getProposal(id: string) {
    return this.proposalValue(this.proposal(id));
  }
  private ensureConcept(
    project: DemoProject,
    name: string,
    blurb?: string,
  ): DemoConcept {
    text(name, 1, 60, "Concept");
    if (blurb !== undefined) text(blurb, 0, 200, "Concept description");
    const slug = conceptSlug(name);
    let concept = this.store.concepts.find(
      (c) => c.subjectId === project.subjectId && c.slug === slug,
    );
    if (!concept) {
      concept = {
        id: crypto.randomUUID(),
        slug,
        name,
        blurb: blurb ?? null,
        subjectId: project.subjectId,
        pinX: null,
        pinY: null,
      };
      this.store.concepts.push(concept);
    } else if (blurb !== undefined) concept.blurb = blurb;
    return concept;
  }
  private validateNote(note: CardDetail["note"]) {
    text(note.front, 1, 1500, "Front");
    text(note.back, 0, 3000, "Back");
    if (
      !["basic", "cloze", "reverse"].includes(note.type) ||
      ![
        "definition",
        "theorem",
        "why",
        "example",
        "counterexample",
        "proof",
        "other",
      ].includes(note.kind)
    )
      invalid("Unknown card type or kind");
    if (
      !Array.isArray(note.tags) ||
      note.tags.some((t) => typeof t !== "string")
    )
      invalid("Invalid tags");
  }
  private reconcile(note: DemoNote) {
    const ords =
      note.note.type === "reverse"
        ? [1, 2]
        : note.note.type === "cloze"
          ? clozeOrds(note.note.front).filter((n) => n > 0)
          : [1];
    const desired = ords.length ? ords : [1],
      removed = note.cards
        .filter((c) => !desired.includes(c.ord))
        .map((c) => c.id);
    note.cards = desired.map(
      (ord) =>
        note.cards.find((c) => c.ord === ord) ?? {
          id: `card-${note.note.noteNo}-${ord}`,
          ord,
          state: {
            state: 0,
            due: this.iso(),
            stability: 0,
            difficulty: 0,
            lastReview: null,
            step: 0,
            reps: 0,
            lapses: 0,
          },
        },
    );
    this.store.reviews = this.store.reviews.filter(
      (r) => !removed.includes(r.cardId),
    );
  }
  private insertNote(
    project: DemoProject,
    input: {
      front: string;
      back: string;
      type: CardDetail["note"]["type"];
      kind: CardDetail["note"]["kind"];
      checkpointCode?: string;
      tags?: string[];
      source?: string;
      page?: string;
      concept?: string;
      sessionNumber?: number | null;
      origin?: CardDetail["note"]["origin"];
    },
  ): DemoNote {
    if (input.checkpointCode) this.checkpoint(project.id, input.checkpointCode);
    if (input.source)
      found(
        this.store.sources.find(
          (s) => s.projectId === project.id && s.short === input.source,
        ),
        "Source",
      );
    const session = input.sessionNumber
      ? found(
          this.store.stressSessionCount
            ? this.virtualStressSession(project, input.sessionNumber)
            : this.store.sessions.find(
                (s) => s.projectId === project.id && s.number === input.sessionNumber,
              ),
          "Session",
        )
      : null;
    const no = Math.max(0, ...this.store.notes.map((n) => n.note.noteNo)) + 1;
    const note: DemoNote = {
      projectId: project.id,
      sessionId: session?.id ?? null,
      conceptId: input.concept
        ? this.ensureConcept(project, input.concept).id
        : null,
      note: {
        noteId: crypto.randomUUID(),
        noteNo: no,
        front: input.front,
        back: input.back,
        type: input.type,
        kind: input.kind,
        tags: [...(input.tags ?? [])],
        status: "active",
        origin: input.origin ?? "user",
        projectSlug: project.slug,
        checkpointCode: input.checkpointCode ?? null,
        sessionNumber: session?.number ?? null,
        sourceShort: input.source ?? null,
        pageLabel: input.page ?? null,
      },
      cards: [],
      comments: [],
    };
    this.validateNote(note.note);
    this.reconcile(note);
    this.store.notes.push(note);
    return note;
  }
  private addCheckpoint(
    p: DemoProject,
    input: PlanCheckpoint,
    code: string,
    position: number,
  ): DemoCheckpoint {
    if (!/^CP[0-9]{1,3}[a-z]?$/.test(code)) invalid("Invalid checkpoint code");
    if (
      this.store.checkpoints.some(
        (cp) => cp.projectId === p.id && cp.code === code,
      )
    )
      conflict("Checkpoint code already exists");
    text(input.title, 1, 80, "Checkpoint title");
    text(input.objective, 1, 400, "Objective");
    text(input.criterion, 1, 400, "Criterion");
    if (
      !Array.isArray(input.steps) ||
      input.steps.length < 1 ||
      input.steps.length > 8
    )
      invalid("A checkpoint needs 1–8 steps");
    input.steps.forEach((step) => text(step, 1, 80, "Step"));
    if (input.recheck_prompt !== undefined)
      text(input.recheck_prompt, 0, 300, "Recheck prompt");
    if (input.source)
      found(
        this.store.sources.find(
          (s) => s.projectId === p.id && s.short === input.source,
        ),
        "Source",
      );
    const cp: DemoCheckpoint = {
      id: crypto.randomUUID(),
      projectId: p.id,
      code,
      title: input.title,
      position,
      stage: input.stage ?? undefined,
      objective: input.objective,
      criterion: input.criterion,
      steps: [...input.steps],
      pages: input.pages ?? null,
      sourceShort: input.source ?? null,
      status: "not_started",
      currentStep: 0,
      recheckLevel: 0,
      recheckDue: null,
      recheckPrompt: input.recheck_prompt ?? null,
      needsRevisit: false,
      prereqs: [],
      conceptIds: [],
    };
    this.store.checkpoints.push(cp);
    return cp;
  }
  private linkCheckpoint(
    p: DemoProject,
    cp: DemoCheckpoint,
    input: PlanCheckpoint,
  ) {
    cp.prereqs = (input.prereqs ?? []).map(
      (code) => this.checkpoint(p.id, code).code,
    );
    cp.conceptIds = (input.concepts ?? []).map(
      (name) => this.ensureConcept(p, name).id,
    );
  }
  private validateGraph(projectId: string) {
    const rows = this.store.checkpoints.filter(
        (cp) => cp.projectId === projectId,
      ),
      done = new Set<string>(),
      path = new Set<string>();
    const visit = (cp: DemoCheckpoint) => {
      if (path.has(cp.code))
        invalid("Checkpoint prerequisites must not contain a cycle");
      if (done.has(cp.code)) return;
      path.add(cp.code);
      for (const code of cp.prereqs) visit(this.checkpoint(projectId, code));
      path.delete(cp.code);
      done.add(cp.code);
    };
    rows.forEach(visit);
  }
  private addPlan(project: DemoProject, plan: PlanPayload) {
    if (this.store.checkpoints.some((cp) => cp.projectId === project.id))
      conflict("This project already has a plan; propose changes instead");
    if (!plan.checkpoints?.length) invalid("A plan needs checkpoints");
    for (const concept of plan.concepts ?? []) {
      const c = this.ensureConcept(project, concept.name, concept.blurb);
      for (const [kind, names] of [
        ["prereq", concept.prereqs],
        ["related", concept.related],
      ] as const)
        for (const name of names ?? []) {
          const other = this.ensureConcept(project, name);
          const fromId = kind === "prereq" ? other.id : c.id,
            toId = kind === "prereq" ? c.id : other.id;
          if (fromId === toId) invalid("A concept cannot link to itself");
          if (
            !this.store.links.some(
              (l) => l.fromId === fromId && l.toId === toId,
            )
          )
            this.store.links.push({ fromId, toId, kind });
        }
    }
    const cps = plan.checkpoints.map((input, i) =>
      this.addCheckpoint(
        project,
        input,
        input.code ?? `CP${i + 1}`,
        (i + 1) * 10,
      ),
    );
    cps.forEach((cp, i) =>
      this.linkCheckpoint(project, cp, plan.checkpoints[i]),
    );
    project.status = "active";
  }
  async approveProposal(id: string, edit?: ProposalEdit) {
    this.transaction(() => {
      const proposal = this.proposal(id);
      if (proposal.status !== "pending") conflict("Proposal is not pending");
      const project = this.project(proposal.projectSlug);
      if (proposal.kind === "card") {
        const payload = found(proposal.card ?? undefined, "Card payload");
        if (edit) keys(edit, ["front", "back", "type"]);
        this.insertNote(project, {
          front: payload.front,
          back: payload.back,
          type: payload.type,
          kind: payload.kind,
          ...edit,
          checkpointCode: payload.checkpoint,
          tags: payload.tags,
          source: payload.source,
          page: payload.page,
          concept: payload.concept,
          sessionNumber: proposal.sessionNumber,
          origin: proposal.origin,
        });
      } else if (proposal.kind === "card_edit") {
        const payload = found(proposal.cardEdit ?? undefined, "Card edit"),
          note = this.note(payload.note_no);
        if (note.projectId !== project.id)
          invalid("Note belongs to another project");
        for (const field of ["front", "back", "type"] as const)
          if (payload[field] !== undefined)
            Object.assign(note.note, { [field]: payload[field] });
        this.validateNote(note.note);
        this.reconcile(note);
        for (const comment of note.comments)
          if (payload.resolves?.includes(comment.no)) {
            comment.status = "addressed";
            comment.resolvedAt = this.iso();
            comment.resolvedByOrigin = proposal.origin;
          }
      } else if (proposal.kind === "plan")
        this.addPlan(
          project,
          found(proposal.plan ?? undefined, "Plan payload"),
        );
      else {
        const plan = found(proposal.planChange ?? undefined, "Plan change");
        for (const op of plan.ops) {
          if (op.op === "add") {
            const cp = this.addCheckpoint(
              project,
              {
                ...op,
                stage: op.stage ?? this.store.checkpoints.find(row =>
                  row.projectId === project.id && row.code === op.after
                )?.stage ?? undefined,
              },
              op.code ?? this.code(project.id, op.after),
              this.position(project.id, op.after),
            );
            this.linkCheckpoint(project, cp, op);
            continue;
          }
          const cp = this.checkpoint(project.id, op.code);
          if (op.op === "update") {
            if (op.title !== undefined) text(op.title, 1, 80, "Title");
            if (op.objective !== undefined)
              text(op.objective, 1, 400, "Objective");
            if (op.criterion !== undefined) {
              text(op.criterion, 1, 400, "Criterion");
              if (cp.status === "demonstrated" && cp.criterion !== op.criterion)
                cp.needsRevisit = true;
            }
            if (op.steps !== undefined) {
              if (op.steps.length < 1 || op.steps.length > 8)
                invalid("A checkpoint needs 1–8 steps");
              op.steps.forEach((s) => text(s, 1, 80, "Step"));
              cp.steps = [...op.steps];
              cp.currentStep = Math.min(cp.currentStep, cp.steps.length);
            }
            for (const field of [
              "title",
              "objective",
              "criterion",
              "pages",
            ] as const)
              if (op[field] !== undefined)
                Object.assign(cp, { [field]: op[field] });
            if (op.recheck_prompt !== undefined) {
              text(op.recheck_prompt, 0, 300, "Recheck prompt");
              cp.recheckPrompt = op.recheck_prompt;
            }
          } else if (op.op === "remove") {
            if (
              cp.status !== "not_started" ||
              this.store.notes.some(
                (n) =>
                  n.projectId === project.id &&
                  n.note.checkpointCode === cp.code,
              ) ||
              this.store.sessions.some(
                (s) =>
                  s.projectId === project.id &&
                  s.events.some((e) => e.checkpointCode === cp.code),
              ) || this.stressCheckpointEvents(project, cp.code).length > 0
            )
              conflict("Only an untouched checkpoint can be removed");
            this.store.checkpoints = this.store.checkpoints.filter(
              (c) => c.id !== cp.id,
            );
            this.store.checkpoints
              .filter((c) => c.projectId === project.id)
              .forEach((c) => {
                c.prereqs = c.prereqs.filter((code) => code !== cp.code);
              });
          } else if (op.op === "move")
            cp.position = this.position(project.id, op.after, cp.id);
          else if (op.op === "prereq_add") {
            this.checkpoint(project.id, op.prereq);
            if (!cp.prereqs.includes(op.prereq)) cp.prereqs.push(op.prereq);
          } else if (op.op === "prereq_remove") {
            this.checkpoint(project.id, op.prereq);
            cp.prereqs = cp.prereqs.filter((code) => code !== op.prereq);
          } else invalid("Unknown plan operation");
        }
      }
      this.validateGraph(project.id);
      proposal.status = "approved";
      if (proposal.kind === "plan" || proposal.kind === "plan_change") {
        proposal.approvedAt = this.iso();
        for (const source of this.store.sources.filter(s => s.projectId === project.id && !s.planCheckedAt))
          source.planCheckedAt = proposal.approvedAt;
      }
    });
  }
  async rejectProposal(id: string) {
    this.transaction(() => {
      const p = this.proposal(id);
      if (p.status !== "pending") conflict("Proposal is not pending");
      p.status = "rejected";
    });
  }
  async approveAllCards() {
    let count = 0;
    for (const p of await this.listProposals())
      if (p.kind === "card") {
        await this.approveProposal(p.id);
        count++;
      }
    return count;
  }
  async getReviewItems(filter: QueueFilter) {
    const eligibleStarted=performance.now();
    const eligible = this.eligible();
    const eligibleFinished=performance.now();
    const notes=this.reviewNotes();
    const options={...filter,includeNew:filter.includeNew||filter.newOnly};
    // Generated, unedited stress notes have neither session nor concept
    // associations. An empty metadata map has exactly the same filter
    // semantics without a second O(4,000) scan of the virtual due cohort.
    if(notes===this.virtualReviewNotes &&
       typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function'){
      const cloneStarted=performance.now();
      const result=clone(filterReviewItems(eligible,options));
      performance.measure('review-run-demo-eligible',{start:eligibleStarted,end:eligibleFinished});
      performance.measure('review-run-demo-final-clone',{start:cloneStarted,end:performance.now()});
      return result;
    }
    const needed = new Set(eligible.map(card => card.cardId));
    const sessionForCard: Record<string, string> = {},
      conceptsForCard: Record<string, string[]> = {};
    // Extreme has 30,000 cards and 2,500 ideas. The old per-card
    // Array.find did up to 75 million comparisons before Review could paint.
    // Index concepts once and attach metadata only to the bounded daily
    // queue, never all 30,000 cards. Concept/session filtering is unchanged.
    // Generated stress notes have no concept IDs. Avoid hydrating 2,500
    // unrelated Atlas ideas merely to build a map with no matching keys.
    const conceptSlugs = notes===this.virtualReviewNotes
      ?new Map<string,string>()
      :new Map(this.store.concepts.map(c => [c.id, c.slug] as const));
    for (const note of notes) {
      const slug = note.conceptId ? conceptSlugs.get(note.conceptId) : undefined;
      const concepts = slug ? [slug] : [];
      for (const card of note.cards) {
        if (!needed.has(card.id)) continue;
        if (note.sessionId) sessionForCard[card.id] = note.sessionId;
        conceptsForCard[card.id] = concepts;
      }
    }
    return clone(
      filterReviewItems(
        eligible,
        options,
        {
          sessionForCard,
          conceptsForCard,
        },
      ),
    );
  }
  async getDeckTree(): Promise<DeckNode[]> {
    const activeProjects=new Map(this.store.projects
      .filter(p=>p.status!=="archived"&&!p.system).map(p=>[p.id,p] as const));
    const {projectCounts,checkpointCounts}=this.dueSnapshot();
    const dueCheckpoints=new Map<string,DemoCheckpoint[]>();
    for(const cp of this.store.checkpoints){
      const project=activeProjects.get(cp.projectId);
      if(!project||(checkpointCounts.get(cpKey(project.slug,cp.code))??0)===0)continue;
      const rows=dueCheckpoints.get(cp.projectId)??[];
      rows.push(cp);dueCheckpoints.set(cp.projectId,rows);
    }
    // The deck tree needs project identity and glyph only; re-running
    // listProjects here re-scans every card, source and checkpoint on Today.
    return this.store.projects.filter(p=>!p.system&&p.status!=="archived")
      .sort((a,b)=>Date.parse(b.lastActivityAt??"1970-01-01")-Date.parse(a.lastActivityAt??"1970-01-01"))
      .map(p=>({
      key:`project:${p.slug}` as const,
      label:p.title,
      glyph:this.displaySubject(p.subjectId).glyph,
      level:0 as const,
      due:projectCounts.get(p.slug)??0,
      children:(dueCheckpoints.get(p.id)??[]).map(cp=>({
        key:`cp:${p.slug}:${cp.code}` as const,
        label:cp.title,
        glyph:this.displaySubject(p.subjectId).glyph,
        level:1 as const,
        due:checkpointCounts.get(cpKey(p.slug,cp.code))??0,
        children:[],
      })),
    }));
  }
  private validateState(state: CardState) {
    if (
      ![0, 1, 2, 3].includes(state.state) ||
      !Number.isFinite(Date.parse(state.due)) ||
      (state.lastReview !== null &&
        !Number.isFinite(Date.parse(state.lastReview))) ||
      !Number.isFinite(state.stability) ||
      state.stability < 0 ||
      !Number.isFinite(state.difficulty) ||
      state.difficulty < 0 ||
      state.difficulty > 10 ||
      [state.step, state.reps, state.lapses].some(
        (v) => !Number.isInteger(v) || v < 0,
      )
    )
      invalid("Invalid card state");
  }
  async recordReview(input: RecordReviewInput) {
    return this.transaction(() => {
      if (
        ![1, 2, 3, 4].includes(input.rating) ||
        !Number.isInteger(input.durationMs) ||
        input.durationMs < 0 ||
        input.durationMs > 600000 ||
        (input.confidence !== null &&
          !["sure", "unsure", "guess"].includes(input.confidence))
      )
        invalid("Invalid review");
      this.validateState(input.next);
      const note = found(
          this.store.notes.find((n) =>
            n.cards.some((c) => c.id === input.cardId),
          ),
          "Card",
        ),
        card = found(
          note.cards.find((c) => c.id === input.cardId),
          "Card",
        );
      const id = Math.max(0, ...this.store.reviews.map((r) => r.id)) + 1;
      this.store.reviews.push({
        id,
        cardId: card.id,
        reviewedAt: this.iso(),
        rating: input.rating,
        stateBefore: card.state.state,
        confidence: input.confidence,
        durationMs: input.durationMs,
        projectId: note.projectId,
        prev: clone(card.state),
        undoneAt: null,
      });
      card.state = clone(input.next);
      this.projectById(note.projectId).lastActivityAt = this.iso();
      return { reviewId: id };
    });
  }
  async undoReview(reviewId: number) {
    return this.transaction(() => {
      const r = found(
        this.store.reviews.find((r) => r.id === reviewId),
        "Review",
      );
      const newest = this.store.reviews
        .filter((v) => v.cardId === r.cardId && !v.undoneAt)
        .sort((a, b) => b.id - a.id)[0];
      if (r.undoneAt || newest?.id !== r.id)
        conflict("Only the last answer can be undone");
      const card = found(
        this.store.notes.flatMap((n) => n.cards).find((c) => c.id === r.cardId),
        "Card",
      );
      card.state = clone(r.prev);
      r.undoneAt = this.iso();
      return clone(card.state);
    });
  }
  async searchCards(query: string, slug?: string): Promise<CardRow[]> {
    if (slug) this.project(slug);
    const needle = query.toLowerCase();
    return this.store.notes
      .filter(
        (n) =>
          n.note.status !== "deleted" &&
          (!slug || n.note.projectSlug === slug) &&
          (n.note.front.toLowerCase().includes(needle) ||
            n.note.back.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.note.noteNo - b.note.noteNo)
      .slice(0, 100)
      .map((n) => ({
        noteNo: n.note.noteNo,
        front: n.note.front,
        type: n.note.type,
        kind: n.note.kind,
        projectSlug: n.note.projectSlug,
        glyph: this.subject(this.projectById(n.projectId).subjectId).glyph,
        checkpointCode: n.note.checkpointCode,
        due: n.cards.length
          ? new Date(
              Math.min(...n.cards.map((c) => Date.parse(c.state.due))),
            ).toISOString()
          : null,
        status: n.note.status,
        openComments: n.comments.filter((c) => c.status === "open").length,
      }));
  }
  async searchCardsPage(...args: Parameters<LemmaApi['searchCardsPage']>): ReturnType<LemmaApi['searchCardsPage']> {
    const [filter]=args,needle=filter.query.trim().toLowerCase(),offset=filter.offset??0;
    if(!Number.isSafeInteger(offset)||offset<0)invalid('Card page offset must be nonnegative');
    const rows:CardRow[]=[];
    let matched=0,hasMore=false;
    // The private S/X fixture is a deterministic numbered card sequence.
    // A 50-row Cards page must not hydrate 30k future notes merely to inspect
    // its last 51 rows. Generate only matches; all edits materialize the store
    // and take the normal exact filtering path below.
    const deferred=typeof Object.getOwnPropertyDescriptor(this.store,'notes')?.get==='function';
    const template=demoSeedFixture.notes[0];
    if(deferred&&this.virtualStressDue&&template?.cards[0]?.state.state===2){
      if((filter.noteStatus&&filter.noteStatus!=='active')||
         filter.hasOpenComments||(filter.state!==undefined&&filter.state!==2))
        return {rows,nextOffset:null};
      const projects=this.store.projects,dueCount=this.store.stressDueCount??0;
      for(let i=(this.store.stressNoteCount??0)-1;i>=0;i--){
        const project=projects[i%projects.length];
        if(filter.projectSlug&&project.slug!==filter.projectSlug)continue;
        const checkpointCode='CP'+(i%36+1);
        if(filter.checkpointCode&&checkpointCode!==filter.checkpointCode)continue;
        // Most generated cards have simple indexed text. Check that first,
        // so a rare search does not construct 30k rich note objects.
        if(needle&&i>5){
          const no=i+1;
          if(!('Recall the definition in card '+no+'?').toLowerCase().includes(needle)&&
             !('Prove the statement for card '+no+'.').toLowerCase().includes(needle))
            continue;
        }
        const n=makeStressNotes(template,projects,1,dueCount,i)[0],note=n.note;
        if(needle&&!note.front.toLowerCase().includes(needle)&&
           !note.back.toLowerCase().includes(needle))continue;
        if(matched++<offset)continue;
        if(rows.length===50){hasMore=true;break;}
        rows.push({noteNo:note.noteNo,front:note.front,type:note.type,kind:note.kind,
          projectSlug:note.projectSlug,glyph:this.subject(project.subjectId).glyph,
          checkpointCode:note.checkpointCode,
          due:new Date(i<dueCount?this.virtualStressDue.overdue:
            this.virtualStressDue.future).toISOString(),
          status:note.status,openComments:0});
      }
      return {rows,nextOffset:hasMore?offset+50:null};
    }
    // Newest notes first, without copying or sorting the 30,000-card store.
    // Stop after 51 matches to keep the rendered card library bounded.
    for(let i=this.store.notes.length-1;i>=0;i--){
      const n=this.store.notes[i],note=n.note;
      if(note.status==='deleted'&&filter.noteStatus!=='deleted')continue;
      if(filter.projectSlug&&note.projectSlug!==filter.projectSlug)continue;
      if(filter.checkpointCode&&note.checkpointCode!==filter.checkpointCode)continue;
      if(filter.noteStatus&&note.status!==filter.noteStatus)continue;
      const open=n.comments.filter(c=>c.status==='open').length;
      if(filter.hasOpenComments&&open===0)continue;
      if(filter.state!==undefined&&!n.cards.some(c=>c.state.state===filter.state))continue;
      if(needle&&!note.front.toLowerCase().includes(needle)&&!note.back.toLowerCase().includes(needle))continue;
      if(matched++<offset)continue;
      if(rows.length===50){hasMore=true;break;}
      rows.push({noteNo:note.noteNo,front:note.front,type:note.type,kind:note.kind,
       projectSlug:note.projectSlug,glyph:this.subject(this.projectById(n.projectId).subjectId).glyph,
       checkpointCode:note.checkpointCode,
       due:n.cards.length?new Date(Math.min(...n.cards.map(c=>Date.parse(c.state.due)))).toISOString():null,
       status:note.status,openComments:open});
    }
    return {rows,nextOffset:hasMore?offset+50:null};
  }
  async getCard(noteNo: number): Promise<CardDetail> {
    const n=this.readOnlyNote(noteNo);
    const [history,comments]=await Promise.all([
      this.getCardHistoryPage(noteNo),this.getCardCommentsPage(noteNo)
    ]);
    return {note:clone(n.note),cards:n.cards.map(c=>({ord:c.ord,state:clone(c.state)})),
      history:history.rows,comments:comments.rows,
      historyNextCursor:history.nextCursor,commentsNextCursor:comments.nextCursor};
  }
  async createNote(input: CreateNoteInput) {
    return this.transaction(() => ({
      noteNo: this.insertNote(this.project(input.projectSlug), input).note
        .noteNo,
    }));
  }
  async updateNote(noteNo: number, patch: NotePatch) {
    this.transaction(() => {
      keys(patch, ["front", "back", "type", "kind", "tags"]);
      const n = this.note(noteNo);
      Object.assign(n.note, clone(patch));
      this.validateNote(n.note);
      this.reconcile(n);
    });
  }
  async setNoteStatus(noteNo: number, status: NoteStatus) {
    if (!["active", "suspended", "deleted"].includes(status))
      invalid("Unknown note status");
    this.note(noteNo).note.status = status;
    this.dueSnapshotCache=null;
  }
  async addComment(noteNo: number, body: string): Promise<CardComment> {
    return this.transaction(() => {
      text(body, 1, 500, "Comment");
      const n = this.note(noteNo),
        comment: CardComment = {
          no:
            Math.max(
              0,
              ...this.store.notes.flatMap((n) => n.comments).map((c) => c.no),
            ) + 1,
          body,
          status: "open",
          createdAt: this.iso(),
          resolvedAt: null,
          resolvedByOrigin: null,
        };
      n.comments.push(comment);
      return clone(comment);
    });
  }
  async dismissComment(no: number) {
    const comment = found(
      this.store.notes.flatMap((n) => n.comments).find((c) => c.no === no),
      "Comment",
    );
    comment.status = "dismissed";
  }
  async resolveMisconception(id: string) {
    found(
      this.store.misconceptions.find((m) => m.id === id),
      "Misconception",
    ).resolvedAt = this.iso();
  }
  async getAtlas(): Promise<AtlasGraph> {
    // A stress profile has thousands of ideas and tens of thousands of notes.
    // Index once: scanning every note, checkpoint and due card per concept is
    // quadratic and blocked the Atlas route for >8s at 4x CPU.
    const subjects = await this.listSubjects();
    const visibleSubjects = new Set(subjects.map(subject => subject.id));
    const checkpointsByConcept = new Map<string, DemoCheckpoint[]>();
    for (const cp of this.store.checkpoints) {
      // 6,000 synthetic checkpoints have no concept IDs. Avoid allocating
      // thousands of empty Sets on the Atlas 4× CPU critical path, while
      // retaining exact deduplication for the occasional multi-link checkpoint.
      if(!cp.conceptIds.length)continue;
      const ids=cp.conceptIds.length===1?cp.conceptIds:new Set(cp.conceptIds);
      for (const id of ids) {
        const bucket = checkpointsByConcept.get(id) ?? [];
        bucket.push(cp);
        checkpointsByConcept.set(id, bucket);
      }
    }
    const cardIdsByConcept = new Map<string, Set<string>>();
    // The generated S/X notes all have conceptId:null. Their 30k objects are
    // irrelevant to Atlas, and a direct cold Atlas must not force allocation.
    // If a user adds a concept-linked note, its array grows beyond the seeded
    // count and the normal exact scan automatically resumes.
    const syntheticUnlinked=this.virtualStressDue!==null&&(
      !!Object.getOwnPropertyDescriptor(this.store,'notes')?.get||
      this.store.notes.length===this.store.stressNoteCount);
    if(!syntheticUnlinked)for (const note of this.store.notes) {
      if (!note.conceptId) continue;
      const ids = cardIdsByConcept.get(note.conceptId) ?? new Set<string>();
      for (const card of note.cards) ids.add(card.id);
      cardIdsByConcept.set(note.conceptId, ids);
    }
    // Only linked cards can contribute to Atlas status or due counts.
    // Stress profile X contains a large review history, but most cards have no
    // idea link; scanning that history when there are no linked cards wastes
    // hundreds of thousands of iterations on the Atlas critical path.
    const linkedCardIds = new Set<string>();
    for (const ids of cardIdsByConcept.values())
      for (const id of ids) linkedCardIds.add(id);
    const dueByCard = new Map<string, number>();
    if (linkedCardIds.size) {
      // The Atlas only needs card IDs, not 30,000 rich ReviewItem objects.
      // allItems() resolves each note's project/checkpoint and clones state;
      // on the extreme fixture that work dominates the 4x CPU transition.
      // Keep the exact dueToday selection order, sibling deduplication and
      // daily quotas, but feed it lightweight state references instead.
      const now = this.now();
      const start = studyDayBounds(now, this.store.settings.timeZone,
        this.store.settings.rolloverHour).start;
      const active = new Set(this.store.projects
        .filter(p => p.status !== "archived" && !p.system).map(p => p.id));
      const candidates: {cardId:string;noteId:string;state:CardState}[] = [];
      for (const note of this.store.notes) {
        if (note.note.status !== "active" || !active.has(note.projectId)) continue;
        for (const card of note.cards)
          candidates.push({cardId:card.id,noteId:note.note.noteId,state:card.state});
      }
      let answeredToday = 0, newAnsweredToday = 0;
      for (const review of this.store.reviews) {
        if (review.undoneAt) continue;
        const at = Date.parse(review.reviewedAt);
        if (at < start || at > now) continue;
        answeredToday++;
        if (review.stateBefore === 0) newAnsweredToday++;
      }
      for (const item of dueToday(candidates, this.store.settings,
        {now, answeredToday, newAnsweredToday}))
        if (linkedCardIds.has(item.cardId))
          dueByCard.set(item.cardId, (dueByCard.get(item.cardId) ?? 0) + 1);
    }
    const reviewsByCard = new Map<string, DemoReview[]>();
    if (linkedCardIds.size) for (const review of this.store.reviews) {
      if (review.undoneAt || !linkedCardIds.has(review.cardId)) continue;
      const bucket = reviewsByCard.get(review.cardId) ?? [];
      bucket.push(review);
      reviewsByCard.set(review.cardId, bucket);
    }
    const unresolved = new Set(this.store.misconceptions
      .filter(m => !m.resolvedAt).map(m => m.conceptId));
    const projectSlugs = new Map(this.store.projects.map(p => [p.id, p.slug]));
    const now = this.now();
    return {
      subjects,
      concepts: this.store.concepts.filter(c => visibleSubjects.has(c.subjectId)).map(c => {
        const checkpoints = checkpointsByConcept.get(c.id) ?? [];
        const ids = cardIdsByConcept.get(c.id) ?? new Set<string>();
        const reviews: DemoReview[] = [];
        let dueCards = 0;
        for (const id of ids) {
          dueCards += dueByCard.get(id) ?? 0;
          const history = reviewsByCard.get(id);
          if (history) reviews.push(...history);
        }
        return {
          // DemoConcept contains only primitive fields; a shallow copy is
          // independent and avoids thousands of structuredClone calls at 4x CPU.
          ...c,
          status: conceptStatus(
            checkpoints.map(cp => this.cpUi(cp)),
            unresolved.has(c.id), reviews, now,
          ),
          checkpointRefs: checkpoints.map(cp => ({
            projectSlug: projectSlugs.get(cp.projectId) ?? this.projectById(cp.projectId).slug,
            code: cp.code,
          })),
          dueCards,
        };
      }),
      // Atlas links also contain only primitive fields; copy each record so
      // callers cannot mutate the underlying demo store.
      links: this.store.links.map(link => ({...link})),
    };
  }
  async pinConcept(id: string, x: number | null, y: number | null) {
    if ((x===null)!==(y===null) || (x!==null&&!Number.isFinite(x)) || (y!==null&&!Number.isFinite(y)))
      invalid("Invalid pin coordinates");
    const c = found(
      this.store.concepts.find((c) => c.id === id),
      "Concept",
    );
    c.pinX = x;
    c.pinY = y;
  }
  async getReviewLog(): Promise<ReviewLogEntry[]> {
    return this.store.reviews
      .filter((r) => !r.undoneAt)
      .sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt))
      .map((r) => ({
        cardId: r.cardId,
        reviewedAt: r.reviewedAt,
        rating: r.rating,
      }));
  }
  async getInsightData(days: InsightDays): Promise<InsightData> {
    if (![7, 30, 90].includes(days)) invalid("Invalid insight range");
    const aggregate = makeStressInsightAggregate(this.store,days,this.now(),this.store.settings.timeZone,this.store.settings.rolloverHour);
    // Match ST-5 live semantics: the browser receives bounded aggregates, not raw history.
    if (aggregate) return {aggregate,reviews:[],sessions:[],checkpointEvents:[],projects:[],misconceptions:[]};
    const bounds = studyDayBounds(
        this.now(),
        this.store.settings.timeZone,
        this.store.settings.rolloverHour,
      ),
      startDay = bounds.index - days + 1;
    const start = new Date(startDay * DAY).toISOString().slice(0, 10),
      within = (at: string) =>
        Date.parse(at) <= this.now() &&
        studyDay(
          Date.parse(at),
          this.store.settings.timeZone,
          this.store.settings.rolloverHour,
        ) >= start;
    return {
      reviews: this.store.reviews
        .filter((r) => !r.undoneAt && within(r.reviewedAt))
        .map(({ id, cardId, prev, undoneAt, ...r }) => clone(r)),
      sessions: this.store.sessions
        .filter((s) => within(s.startedAt))
        .map((s) => ({
          startedAt: s.startedAt,
          minutes: s.minutes,
          projectId: s.projectId,
          goalMet: s.goalMet,
        })),
      checkpointEvents: clone(
        this.store.checkpointEvents.filter((e) => within(e.at)),
      ),
      projects: this.store.projects.map((p) => ({
        id: p.id,
        title: p.title,
        subject: clone(this.displaySubject(p.subjectId)),
      })),
      misconceptions: this.store.misconceptions.map((m) => ({
        label: m.label,
        times: m.times,
        conceptName:
          this.store.concepts.find((c) => c.id === m.conceptId)?.name ?? null,
      })),
    };
  }
  async addSource(
    projectId: string,
    file: File,
    onProgress: (progress: IngestProgress) => void,
  ): Promise<Source> {
    this.projectById(projectId);
    // Hash before creating the row so concurrent identical uploads cannot both enter
    // the queue; a failed upload remains retryable.
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (this.store.sources.some(source => source.projectId === projectId &&
        source.sha256 === sha256 && source.status !== "failed"))
      conflict("Already added: this PDF is in the project");
    const title = (file.name.replace(/\.(pdf|tex|latex|ltx|md|markdown)$/i, "") || "Source").slice(0, 120),
      base = (
        title
          .split(/\s+/)[0]
          .toLowerCase()
          .replace(/[^a-z]/g, "") || "source"
      ).slice(0, 18);
    let short = base,
      n = 2;
    while (
      this.store.sources.some(
        (s) => s.projectId === projectId && s.short === short,
      )
    )
      short = base.slice(0, 20 - String(n).length) + String(n++);
    const source = {
      id: crypto.randomUUID(),
      projectId,
      title,
      short,
      filename: file.name,
      bytes: file.size,
      sha256,
      pageCount: null as number | null,
      status: "uploading" as Source["status"],
      hasText: true,
      outline: [] as Source["outline"],
      createdAt: this.iso(),
      addedAt: this.iso(),
      planCheckedAt: null as string | null,
      kind: "other" as const,
      position: this.store.sources.filter(s => s.projectId === projectId).length,
      pages: [] as { page: number; label: string; body: string }[],
      error: null as string | null,
    };
    this.store.sources.push(source);
    try {
      source.status = "extracting";
      const { ingest } = await import("../../pdf/ingest");
      const result = await ingest(file, {
        onProgress: (progress) => {
          if (progress.phase !== "done") onProgress(progress);
        },
      });
      const current = () =>
        found(
          this.store.sources.find((s) => s.id === source.id),
          "Source",
        );
      current().pageCount = result.pageCount;
      current().hasText = result.hasText;
      current().outline = result.outline;
      onProgress({
        phase: "saving",
        page: 0,
        pageCount: result.pageCount,
        message: "Saving pages",
      });
      for (let offset = 0; offset < result.pages.length; offset += 50) {
        current().pages.push(...result.pages.slice(offset, offset + 50));
        onProgress({
          phase: "saving",
          page: current().pages.length,
          pageCount: result.pageCount,
          message: "Saving pages",
        });
        await Promise.resolve();
      }
      current().status = "ready";
      onProgress({
        phase: "done",
        page: result.pageCount,
        pageCount: result.pageCount,
        message: `${result.pageCount}/${result.pageCount} pages read`,
      });
      const { pages, error, ...value } = current();
      return clone(value);
    } catch (error) {
      const current = this.store.sources.find((s) => s.id === source.id);
      if (current) {
        current.status = "failed";
        current.error =
          error instanceof Error ? error.message : "Couldn't read this PDF";
      }
      throw error;
    }
  }
  async getSourceTranscriptionStats(projectId:string):Promise<import('../types').SourceTranscriptionStat[]>{
    this.projectById(projectId);
    return this.store.sources.filter(s=>s.projectId===projectId).map(s=>({
      sourceId:s.id,transcribed:s.pages.filter(p=>!!p.transcribedAt||!!p.transcribedBy).length,
      needsCheck:s.pages.filter(p=>p.confidence==='check').length
    }));
  }
  async getSourcePage(sourceId:string,page:number):Promise<import('../types').TranscribedSourcePage|null>{
    const source=found(this.store.sources.find(s=>s.id===sourceId),'Source');
    const item=source.pages.find(p=>p.page===page) ?? stressSourcePage(source,page);
    return item?{
      sourceId:source.id,page:item.page,label:item.label??null,body:item.body,
      confidence:item.confidence??null,transcribedBy:item.transcribedBy??null
    }:null;
  }
  async getTranscribedPagesForExport(sourceId:string):Promise<import('../types').TranscribedSourcePage[]>{
    const source=found(this.store.sources.find(s=>s.id===sourceId),'Source');
    return source.pages.filter(p=>!!p.transcribedAt||!!p.transcribedBy).sort((a,b)=>a.page-b.page)
      .map(p=>({sourceId:source.id,page:p.page,label:p.label??null,body:p.body,
        transcribedBy:p.transcribedBy??null,confidence:p.confidence??null}));
  }
  async updateSourcePage(sourceId:string,page:number,patch:{body?:string;confidence?:'high'|'check'}):Promise<import('../types').TranscribedSourcePage>{
    return this.transaction(()=>{
      const source=found(this.store.sources.find(s=>s.id===sourceId),'Source');
      const item=found(source.pages.find(p=>p.page===page),'Page');
      if(!item.transcribedAt&&!item.transcribedBy)invalid('This page has no transcription to edit');
      if(patch.body!==undefined){
        if(!patch.body.trim()||patch.body.length>8000||/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(patch.body)||/<!--/.test(patch.body))
          invalid('Transcriptions must contain 1–8,000 Markdown/LaTeX characters, without HTML');
        item.body=patch.body;
      }
      if(patch.confidence!==undefined){
        if(!['high','check'].includes(patch.confidence))invalid('Invalid confidence');
        item.confidence=patch.confidence;
      }
      return {sourceId:source.id,page:item.page,label:item.label??null,body:item.body,
        confidence:item.confidence??null,transcribedBy:item.transcribedBy??null};
    });
  }
  async getSourcePdfUrl(sourceId:string):Promise<string|null>{
    found(this.store.sources.find(s=>s.id===sourceId),'Source');
    // Uploaded demo files are not persisted in storage; don't manufacture a URL.
    return null;
  }
  async deleteSource(id: string) {
    this.transaction(() => {
      const source = found(
        this.store.sources.find((s) => s.id === id),
        "Source",
      );
      this.store.sources = this.store.sources.filter((s) => s.id !== id);
      this.store.checkpoints
        .filter(
          (cp) =>
            cp.projectId === source.projectId &&
            cp.sourceShort === source.short,
        )
        .forEach((cp) => {
          cp.sourceShort = null;
        });
      this.store.notes
        .filter(
          (n) =>
            n.projectId === source.projectId &&
            n.note.sourceShort === source.short,
        )
        .forEach((n) => {
          n.note.sourceShort = null;
        });
    });
  }
  async exportAll() {
    return new Blob(
      [
        JSON.stringify(
          { mode: "demo", exportedAt: this.iso(), ...this.store },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
  }
}
