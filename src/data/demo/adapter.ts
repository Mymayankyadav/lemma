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
import { LemmaError, notImplemented } from "../api";
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
  DemoSession,
  DemoStore,
} from "./model";
import fixtureText from "./fixture.json?raw";
import { hydrateFixture } from "./hydrate";
import {
  checkpointUi,
  conceptStatus,
  dueToday,
  projectProgress,
  sessionDisplay,
  studyDayBounds,
  studyDay,
} from "../../lib/derive";
import { filterReviewItems } from "../../lib/queue";
import { parseSteps } from "../../lib/fsrs";
import legacyRender from "../../lib/render/render.js";
import { slugify } from "../../lib/text";
import { DAY } from "../../lib/calendar";
import {reviewForecast} from "../../lib/review-forecast";
import {makeStressInsightAggregate} from "./stress";

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
}
/** Per-tab memory only; construction/reload restores the fixed seed. No network writes. */
export class DemoAdapter implements LemmaApi {
  readonly mode = "demo" as const;
  async getReviewForecast(): ReturnType<LemmaApi["getReviewForecast"]> {
    const ids=new Set(this.store.projects.filter(p=>p.status!=="archived"&&!p.system).map(p=>p.id));
    const cards=this.store.notes.filter(n=>n.note.status==='active'&&ids.has(n.projectId)).flatMap(n=>n.cards.map(c=>c.state));
    return reviewForecast(cards,this.store.settings,this.now());
  }
  private store: DemoStore;
  private readonly now: () => number;
  constructor(options: DemoOptions = {}) {
    this.now = options.now ?? Date.now;
    this.store = hydrateFixture(
      options.fixture ?? (JSON.parse(fixtureText) as DemoStore),
      this.now(),
      options.timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "UTC",
    );
  }
  private iso() {
    return new Date(this.now()).toISOString();
  }
  private transaction<T>(write: () => T): T {
    const before = clone(this.store);
    try {
      return write();
    } catch (error) {
      this.store = before;
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
  private item(note: DemoNote, card: DemoNote["cards"][number]): ReviewItem {
    const project = this.projectById(note.projectId),
      cp = note.note.checkpointCode
        ? this.store.checkpoints.find(
            (cp) =>
              cp.projectId === project.id &&
              cp.code === note.note.checkpointCode,
          )
        : null;
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
      state: clone(card.state),
    };
  }
  private allItems() {
    const active = new Set(this.store.projects.filter(p => p.status !== "archived" && !p.system).map(p => p.id));
    return this.store.notes
      .filter((n) => n.note.status === "active" && active.has(n.projectId))
      .flatMap((n) => n.cards.map((c) => this.item(n, c)));
  }
  private eligible(): ReviewItem[] {
    const start = studyDayBounds(
      this.now(),
      this.store.settings.timeZone,
      this.store.settings.rolloverHour,
    ).start;
    const today = this.store.reviews.filter(
      (r) =>
        !r.undoneAt &&
        Date.parse(r.reviewedAt) >= start &&
        Date.parse(r.reviewedAt) <= this.now(),
    );
    return dueToday(this.allItems(), this.store.settings, {
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
  private summary(p: DemoProject, eligible = this.eligible()): ProjectSummary {
    const cps = this.store.checkpoints.filter((cp) => cp.projectId === p.id),
      views = cps.map((cp) => this.cpView(cp, eligible)),
      progress = projectProgress(views),
      current = cps.find((cp) => cp.status === "in_progress");
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
      cardsCount: this.store.notes
        .filter((n) => n.projectId === p.id && n.note.status !== "deleted")
        .reduce((n, note) => n + note.cards.length, 0),
      sessionsCount: this.store.sessions.filter(
        (s) => s.projectId === p.id && s.state === "ended",
      ).length,
      sourcesCount: this.store.sources.filter((s) => s.projectId === p.id)
        .length,
      sourceTitles: this.store.sources.filter((s) => s.projectId === p.id)
        .map((source) => source.title),
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
  async listProjects() {
    const eligible = this.eligible();
    return this.store.projects
      .filter(p => !p.system)
      .map((p) => this.summary(p, eligible))
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
    const p = this.project(slug),
      eligible = this.eligible(),
      summary = this.summary(p, eligible);
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
      sources: this.store.sources
        .filter((s) => s.projectId === p.id)
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
    const sessions = this.store.sessions.filter(
      (s) => s.projectId === project.id && s.checkpointCode === code,
    );
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
        this.store.sessions
          .filter((s) => s.projectId === project.id)
          .flatMap((s) => s.events)
          .filter((e) => e.checkpointCode === code)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, 20),
      ),
      cardsCount: this.store.notes
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
    const projects = (await this.listProjects()).filter(p => p.status !== "archived"),
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
      due: this.eligible().length,
      pendingProposals: this.store.proposals.filter(
        (p) => p.status === "pending",
      ).length,
      projects,
    };
  }
  async listSessions(slug?: string) {
    const id = slug ? this.project(slug).id : null;
    return this.store.sessions
      .filter((s) => !id || s.projectId === id)
      .map((s) => this.sessionSummary(s))
      .sort(
        (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
      );
  }
  async getSession(slug: string, number: number): Promise<SessionDetail> {
    const p = this.project(slug),
      s = found(
        this.store.sessions.find(
          (s) => s.projectId === p.id && s.number === number,
        ),
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
      events: clone(s.events),
      misconceptions: clone(
        this.store.misconceptions.filter((m) => m.projectId === p.id),
      ),
      cards: [
        ...this.store.notes
          .filter((n) => n.sessionId === s.id && n.note.status !== "deleted")
          .map((n) => ({
            noteNo: n.note.noteNo,
            front: n.note.front,
            state: "active" as const,
          })),
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
          ? legacyRender.clozeOrds(note.note.front).filter((n) => n > 0)
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
          this.store.sessions.find(
            (s) =>
              s.projectId === project.id && s.number === input.sessionNumber,
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
              )
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
    const sessionForCard: Record<string, string> = {},
      conceptsForCard: Record<string, string[]> = {};
    for (const note of this.store.notes)
      for (const card of note.cards) {
        if (note.sessionId) sessionForCard[card.id] = note.sessionId;
        const concept = this.store.concepts.find(
          (c) => c.id === note.conceptId,
        );
        conceptsForCard[card.id] = concept ? [concept.slug] : [];
      }
    return clone(
      filterReviewItems(
        this.eligible(),
        { ...filter, includeNew: filter.includeNew || filter.newOnly },
        {
          sessionForCard,
          conceptsForCard,
        },
      ),
    );
  }
  async getDeckTree(): Promise<DeckNode[]> {
    const due = this.eligible();
    return (await this.listProjects()).filter(p => p.status !== "archived").map((p) => ({
      key: `project:${p.slug}` as const,
      label: p.title,
      glyph: p.subject.glyph,
      level: 0,
      due: due.filter((c) => c.projectSlug === p.slug).length,
      children: this.store.checkpoints
        .filter(
          (cp) =>
            cp.projectId === p.id &&
            due.some(
              (c) => c.projectSlug === p.slug && c.checkpointCode === cp.code,
            ),
        )
        .map((cp) => ({
          key: `cp:${p.slug}:${cp.code}` as const,
          label: cp.title,
          glyph: p.subject.glyph,
          level: 1,
          due: due.filter(
            (c) => c.projectSlug === p.slug && c.checkpointCode === cp.code,
          ).length,
          children: [],
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
  async searchCardsPage(..._args: Parameters<LemmaApi['searchCardsPage']>): ReturnType<LemmaApi['searchCardsPage']> {
    throw notImplemented('searchCardsPage');
  }
  async getCard(noteNo: number): Promise<CardDetail> {
    const n = this.note(noteNo);
    return {
      note: clone(n.note),
      cards: n.cards.map((c) => ({ ord: c.ord, state: clone(c.state) })),
      history: this.store.reviews
        .filter((r) => n.cards.some((c) => c.id === r.cardId) && !r.undoneAt)
        .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt))
        .map((r) => ({
          reviewedAt: r.reviewedAt,
          rating: r.rating,
          confidence: r.confidence,
        })),
      comments: clone(n.comments),
    };
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
    const eligible = this.eligible();
    // The v3 Atlas navigates the entire owner-visible hierarchy, including
    // structural ancestors and supporting ideas without checkpoint references.
    // Limiting this to checkpoint concept IDs hides clusters/galaxies/systems.
    const visibleSubjects = new Set((await this.listSubjects()).map(subject => subject.id));
    return {
      subjects: await this.listSubjects(),
      concepts: this.store.concepts.filter(c => visibleSubjects.has(c.subjectId)).map((c) => {
        const checkpoints = this.store.checkpoints.filter((cp) =>
            cp.conceptIds.includes(c.id),
          ),
          notes = this.store.notes.filter((n) => n.conceptId === c.id),
          ids = new Set(notes.flatMap((n) => n.cards.map((c) => c.id)));
        return {
          ...clone(c),
          status: conceptStatus(
            checkpoints.map((cp) => this.cpUi(cp)),
            this.store.misconceptions.some(
              (m) => m.conceptId === c.id && !m.resolvedAt,
            ),
            this.store.reviews.filter((r) => ids.has(r.cardId) && !r.undoneAt),
            this.now(),
          ),
          checkpointRefs: checkpoints.map((cp) => ({
            projectSlug: this.projectById(cp.projectId).slug,
            code: cp.code,
          })),
          dueCards: eligible.filter((card) => ids.has(card.cardId)).length,
        };
      }),
      links: clone(this.store.links),
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
      ...(aggregate ? {aggregate} : {}),
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
    const title = (file.name.replace(/\.pdf$/i, "") || "Source").slice(0, 120),
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
