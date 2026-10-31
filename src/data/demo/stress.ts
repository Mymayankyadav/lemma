import type { DemoStore, DemoCheckpoint, DemoNote } from "./model";

/** Pure, repeatable stress profiles. No network calls, dates or random IDs. */
export type StressProfile = "stress" | "extreme";

export function makeStressStore(original: DemoStore, profile: StressProfile): DemoStore {
  const data = structuredClone(original);
  const extreme = profile === "extreme";
  const projectCount = extreme ? 60 : 15;
  const checkpointCount = extreme ? 100 : 40;
  const ideaCount = extreme ? 2500 : 600;
  const linkCount = extreme ? 8000 : 1500;
  const cardCount = extreme ? 30000 : 5000;
  const dueCount = extreme ? 4000 : 600;
  const proposalCount = extreme ? 600 : 150;
  const sessionCount = extreme ? 1000 : 300;
  const subjectCount = extreme ? 40 : 15;
  const baseProject = data.projects[0];
  const baseCheckpoint = data.checkpoints[0];
  const baseNote = data.notes[0];
  const baseSession = data.sessions[0];
  const baseProposal = data.proposals[0];
  const baseConcept = data.concepts[0];
  if (!baseProject || !baseCheckpoint || !baseNote || !baseSession || !baseProposal || !baseConcept) {
    throw Error("Stress fixture requires the seeded demo records");
  }

  for (let i = data.subjects.length; i < subjectCount; i++) {
    data.subjects.push({ id: `subject-stress-${i}`, name: `Subject ${i + 1}`, glyph: "∑", hue: "slate", position: i });
  }
  for (let i = data.projects.length; i < projectCount; i++) {
    data.projects.push({
      ...baseProject, id: `project-stress-${i}`, slug: `stress-project-${i}`,
      title: `Mathematics project ${i + 1}`, subjectId: data.subjects[i % data.subjects.length].id,
      goal: `Prove the main results in subject ${i + 1}`, targetDate: "@date:90",
      targetLabel: "Exam", lastActivityAt: `@day:-${i % 30}:0.5:0`,
    });
  }

  // Preserve the owner's actual failure shape: 36 checkpoints without any stage.
  // A separate project has 100 checkpoints and 15 stages in the extreme profile.
  for (const [pIndex, project] of data.projects.entries()) {
    const count = pIndex === 0 ? 36 : checkpointCount;
    const existing = data.checkpoints.filter(cp => cp.projectId === project.id);
    for (const cp of existing) {
      if (pIndex === 0) cp.stage = undefined;
    }
    for (let n = existing.length + 1; n <= count; n++) {
      const code = `CP${n}`;
      const cp: DemoCheckpoint = {
        ...baseCheckpoint, id: `${project.id}-cp-${n}`, projectId: project.id, code,
        title: `Checkpoint ${n}: a proof with precise hypotheses`, position: n * 10,
        objective: `Prove the result in ${code}`, criterion: "Give a complete proof without hints",
        status: n === 4 ? "in_progress" : n < 4 ? "demonstrated" : "not_started",
        currentStep: n < 4 ? 3 : 0, recheckLevel: 0, recheckDue: null,
        recheckPrompt: `Explain the argument for ${code}`, needsRevisit: false,
        prereqs: n > 1 ? [`CP${n - 1}`] : [], conceptIds: [],
        stage: pIndex === 0 ? undefined : `Stage ${Math.min(15, Math.floor((n - 1) * 15 / count) + 1)}`,
        dueOn: `@date:${n - 10}`, demonstratedAt: n < 4 ? "@date:-10" : null,
      };
      data.checkpoints.push(cp);
    }
    if (pIndex > 0) {
      for (const cp of existing) {
        const n = Number(cp.code.replace("CP", ""));
        cp.stage = `Stage ${Math.min(15, Math.floor((n - 1) * 15 / count) + 1)}`;
      }
    }
  }

  // ST-6: scale the first project's source shelf without materialising
  // thousands of fake PDF pages per source.
  const firstSource = data.sources.find(source => source.projectId === baseProject.id);
  if (!firstSource) throw Error("Stress fixture requires a seeded project source");
  const existingSources = data.sources.filter(source => source.projectId === baseProject.id).length;
  const sourceKinds = ["book", "notes", "slides", "problems", "syllabus", "exam", "other"] as const;
  for (let i = existingSources; i < (extreme ? 100 : 30); i++) {
    data.sources.push({
      ...firstSource,
      id: `stress-source-${i}`, projectId: baseProject.id,
      title: `Source ${i + 1}: mathematical notes and proofs`,
      short: `stresssrc${i}`, filename: `source-${i + 1}.pdf`,
      kind: sourceKinds[i % sourceKinds.length], position: i,
      pageCount: i % 3 === 0 ? 3000 : 1200,
      status: "ready", hasText: false, outline: [], pages: [],
      sha256: null, createdAt: `@day:-${i % 60}:0.5:0`,
      addedAt: `@day:-${i % 60}:0.5:0`, planCheckedAt: null,
    });
  }

  for (let i = data.concepts.length; i < ideaCount; i++) {
    const subject = data.subjects[i % data.subjects.length];
    data.concepts.push({
      ...baseConcept, id: `stress-idea-${i}`, slug: `stress-idea-${i}`,
      name: `Idea ${i}: ${i % 7 === 0 ? "Long mathematical statement" : "Definition"}`,
      blurb: `A mathematical idea with index ${i}`, subjectId: subject.id,
      level: "planet", parentId: null, isStar: false, pinX: null, pinY: null,
    });
  }
  // Deterministic DAG links; avoid duplicates and self-loops.
  const linkKeys = new Set(data.links.map(link => `${link.fromId}:${link.toId}:${link.kind}`));
  for (let offset = 1; data.links.length < linkCount && offset < ideaCount; offset++) {
    for (let i = 0; i + offset < ideaCount && data.links.length < linkCount; i++) {
      const fromId = data.concepts[i].id, toId = data.concepts[i + offset].id;
      const key = `${fromId}:${toId}:prereq`;
      if (!linkKeys.has(key)) {
        data.links.push({ fromId, toId, kind: "prereq" });
        linkKeys.add(key);
      }
    }
  }

  // Long faces and four representative maths stress cases remain real card content.
  const longFront = "State and prove the necessary and sufficient conditions. ".repeat(30).slice(0, 1500);
  const longBack = "First establish the hypotheses, then prove both directions. ".repeat(60).slice(0, 3000);
  const matrix = String.raw`$$\begin{pmatrix}${Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>r===c?"1":"0").join("&")).join(String.raw`\\`)}\end{pmatrix}$$`;
  const aligned = String.raw`$$\begin{aligned}${Array.from({length:25},(_,i)=>`a_${i+1}&=a_${i}+1`).join(String.raw`\\`)}\end{aligned}$$`;
  const sum = String.raw`$$\sum_{i=1}^{60} ${Array.from({length:60},(_,i)=>`x_${i+1}`).join("+")}$$`;
  const inline = String.raw`$\operatorname{${"longexpression".repeat(10)}}$`;
  data.notes = [];
  data.reviews = [];
  for (let i = 0; i < cardCount; i++) {
    const project = data.projects[i % data.projects.length];
    const no = i + 1;
    const note: DemoNote = {
      ...baseNote, projectId: project.id, sessionId: null, conceptId: null,
      note: {
        ...baseNote.note, noteId: `stress-note-${no}`, noteNo: no,
        projectSlug: project.slug, checkpointCode: `CP${(i % 36) + 1}`,
        front: i === 0 ? longFront : i === 2 ? matrix : i === 3 ? aligned : i === 4 ? sum : i === 5 ? inline : `Recall the definition in card ${no}?`,
        back: i === 0 ? longBack : `Prove the statement for card ${no}.`,
        status: "active", sessionNumber: null, sourceShort: null, pageLabel: null,
      },
      cards: [{ id: `stress-card-${no}`, ord: 1, state: {
        ...baseNote.cards[0].state, due: i < dueCount ? "@due:-1" : "@due:14",
        lastReview: "@day:-14:0.5:0",
      }}],
      comments: [],
    };
    data.notes.push(note);
  }
  data.sessions = [];
  for (let i = 0; i < sessionCount; i++) {
    const project = data.projects[i % data.projects.length];
    data.sessions.push({
      ...baseSession, id: `stress-session-${i}`, projectId: project.id,
      number: Math.floor(i / projectCount) + 1, checkpointCode: `CP${(i % 36) + 1}`,
      goal: `Study session ${i + 1}`, startedAt: `@day:-${i % 90}:0.3:0`,
      lastActivityAt: `@day:-${i % 90}:0.6:0`,
      // Keep one real heavy session at S7 of the primary project, without
      // multiplying event memory across all 1,000 sessions.
      events: i === projectCount * 6
        ? Array.from({length: extreme ? 400 : 150},(_,n)=>{
          const phase=n % 12;
          const kind=phase<9?'hint':phase===9?'attempt':phase===10?'evidence':'recheck';
          return {
            id:n+1,kind,
            body:kind==='hint'?`Hint ${n+1}: isolate the essential hypothesis.`
              :kind==='attempt'?`Attempt ${n+1}: justify each implication.`
              :kind==='evidence'?`Evidence ${n+1}: a complete argument is recorded.`
              :`Recheck ${n+1}: repeat without referring to the hint.`,
            outcome:kind==='evidence'?'demonstrated':null,
            hintLevel:kind==='hint'?Math.min(20,phase+1):null,
            checkpointCode:`CP${(i % 36)+1}`,
            createdAt:new Date(Date.UTC(2026,9,31,0,n)).toISOString(),
          } as const;
        })
        : [],
    });
  }
  data.proposals = [];
  for (let i = 0; i < proposalCount; i++) {
    const project = data.projects[i % data.projects.length];
    data.proposals.push({
      ...baseProposal, id: `stress-proposal-${i}`, projectSlug: project.slug,
      reason: `Tutor proposal ${i + 1}`, createdAt: `@day:-${i % 10}:0.5:0`,
      status: "pending", card: baseProposal.card ? {...baseProposal.card, front: `Explain idea ${i + 1}.`} : null,
    });
  }
  data.misconceptions = [];
  data.checkpointEvents = [];
  data.seed = extreme ? 2026103102 : 2026103101;
  // Keep the backlog real: dueCount describes overdue cards, not the daily quota.
  // A 4,000-card backlog must still offer a bounded 200-card daily share.
  data.settings.reviewsPerDay = 200;
  data.settings.newPerDay = 20;
  return data;
}
