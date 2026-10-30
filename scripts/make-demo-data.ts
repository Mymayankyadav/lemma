import { writeFileSync, readFileSync } from "node:fs";
import { mathPrompts } from "../src/data/demo/math-prompts";
import type {
  DemoStore,
  DemoCheckpoint,
  DemoSession,
  DemoNote,
  DemoReview,
} from "../src/data/demo/model";
import type {
  CardState,
  Confidence,
  NoteKind,
  Rating,
  SessionEvent,
} from "../src/data/types";

const SEED = 20261029;
let state = SEED >>> 0;
const random = () => {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return state / 4294967296;
};
const day = (ago: number, fraction = 0.5, offset = 0) =>
  `@day:${-ago}:${fraction}:${offset}`;
const ago = (minutes: number) => `@now:${-minutes}`;
const due = (offset: number) => `@due:${offset}`;
const titleSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const data: DemoStore = {
  version: 1,
  seed: SEED,
  settings: {
    desiredRetention: 0.9,
    newPerDay: 20,
    reviewsPerDay: 200,
    learnSteps: "1m 10m",
    relearnSteps: "10m",
    rolloverHour: 4,
    maxIntervalDays: 36500,
    fuzz: true,
    loadBalance: true,
    learnAheadMinutes: 20,
    fsrsWeights: null,
    fsrsTunedAt: null,
    macros: readFileSync(
      new URL("../docs/spec/data.md", import.meta.url),
      "utf8",
    )
      .split("## 12. Default KaTeX macros")[1]
      .split("```")[1]
      .trim(),
    defaultStyle: "socratic",
    tutorRules: null,
    mixDecks: true,
    preferredChat: "claude",
    connectorUrl:
      "https://demo.lemma.invalid/functions/v1/mcp/demo-only-not-a-credential",
    connectorLastSeenAt: ago(120),
    connectorLastClient: "claude",
    timeZone: "UTC",
  },
  styles: [],
  subjects: [
    {
      id: "subject-analysis",
      name: "Analysis",
      glyph: "∫",
      hue: "amber",
      position: 0,
    },
    {
      id: "subject-topology",
      name: "Topology",
      glyph: "τ",
      hue: "violet",
      position: 1,
    },
    {
      id: "subject-linear",
      name: "Linear Algebra",
      glyph: "λ",
      hue: "cyan",
      position: 2,
    },
  ],
  projects: [],
  checkpoints: [],
  sources: [],
  sessions: [],
  notes: [],
  reviews: [],
  proposals: [],
  concepts: [],
  links: [],
  misconceptions: [],
  checkpointEvents: [],
};
const presetText = readFileSync(
  new URL("../docs/spec/connector.md", import.meta.url),
  "utf8",
)
  .split("## 7. Teaching style presets")[1]
  .split("## 8.")[0];
for (const line of presetText.split("\n")) {
  const match = line.match(
    /^\| `([^`]+)` \| ([^|]+) \| `([^`]+)` \| ([^|]+) \|$/,
  );
  if (match)
    data.styles.push({
      key: match[1],
      name: match[2].trim(),
      icon: match[3],
      instructions: match[4].trim(),
      position: data.styles.length,
    });
}
const definitions = [
  {
    id: "project-analysis",
    slug: "real-analysis",
    title: "Real Analysis",
    subjectId: "subject-analysis",
    goal: "Prove the main theorems of Rudin ch. 2–4. Comfortable with ε–δ, shaky on topology arguments.",
    titles: [
      "Metric spaces",
      "Open and closed sets",
      "Sequences",
      "Compactness",
      "Continuity",
      "Limits of functions",
      "Heine–Borel",
      "Uniform continuity",
      "Extreme value theorem",
      "Connectedness",
      "Intermediate value theorem",
      "Capstone proofs",
    ],
    done: 3,
    current: 4,
  },
  {
    id: "project-linear",
    slug: "linear-algebra",
    title: "Linear Algebra",
    subjectId: "subject-linear",
    goal: "Build reliable proofs about vector spaces, linear maps and diagonalization.",
    titles: [
      "Vector spaces",
      "Linear independence",
      "Span",
      "Basis",
      "Linear maps",
      "Rank",
      "Null spaces",
      "Determinants",
      "Diagonalization",
      "Eigenvectors",
      "Invariant subspaces",
      "Spectral theorem",
      "Jordan form",
      "Capstone proofs",
    ],
    done: 8,
    current: 9,
  },
  {
    id: "project-topology",
    slug: "topology",
    title: "Topology",
    subjectId: "subject-topology",
    goal: "Construct examples and proofs about topological spaces and separation.",
    titles: [
      "Sets and functions",
      "Topological spaces",
      "Open covers",
      "Hausdorff spaces",
      "Connectedness",
      "Compact spaces",
      "Products",
      "Quotients",
      "Capstone proofs",
    ],
    done: 1,
    current: 2,
  },
];
for (const def of definitions) {
  data.projects.push({
    id: def.id,
    slug: def.slug,
    title: def.title,
    subjectId: def.subjectId,
    goal: def.goal,
    style: "socratic",
    status: "active",
    createdAt: day(100),
    lastActivityAt:
      def.slug === "real-analysis"
        ? ago(120)
        : day(def.slug === "linear-algebra" ? 2 : 3),
  });
  for (const [index, title] of def.titles.entries()) {
    const n = index + 1,
      compact = def.slug === "real-analysis" && n === 4;
    const cp: DemoCheckpoint = {
      id: `${def.id}-cp-${n}`,
      projectId: def.id,
      code: `CP${n}`,
      title,
      position: n * 10,
      objective: compact
        ? "Prove compact sets in a Hausdorff space are closed."
        : `Reason precisely about ${title.toLowerCase()}.`,
      criterion: compact
        ? "Writes, unaided, a proof that compact sets in a Hausdorff space are closed."
        : `Produces an unaided proof or counterexample about ${title.toLowerCase()}.`,
      steps: compact
        ? [
            "Set up the cover",
            "Separate x from K",
            "Use a finite subcover",
            "Conclude",
          ]
        : [
            "Recall the definitions",
            "Construct the argument",
            "Explain why it works",
          ],
      pages: compact ? "36-40" : null,
      sourceShort: def.slug === "real-analysis" ? "rudin" : null,
      status:
        n <= def.done
          ? "demonstrated"
          : n === def.current
            ? "in_progress"
            : "not_started",
      currentStep: n <= def.done ? 3 : compact ? 2 : n === def.current ? 1 : 0,
      recheckLevel: n <= def.done ? 2 : 0,
      recheckDue: n <= def.done ? "@date:20" : null,
      recheckPrompt: `Explain ${title.toLowerCase()} without looking at your notes.`,
      needsRevisit: false,
      prereqs: n === 1 || n === def.current + 1 ? [] : [`CP${n - 1}`],
      conceptIds: [],
    };
    if (def.slug === "real-analysis" && n === 2) {
      cp.recheckDue = "@date:0";
      cp.recheckPrompt = "What makes a set open in a metric space?";
    }
    data.checkpoints.push(cp);
    if (n <= def.done)
      data.checkpointEvents.push({
        at: day(28 - index * 2),
        kind: "demonstrated",
        checkpointCode: cp.code,
        projectId: def.id,
      });
  }
}
const conceptGroups: [string, string[], string[]][] = [
  [
    "subject-analysis",
    [
      "Metric spaces",
      "Open sets",
      "Sequences",
      "Compactness",
      "Continuity",
      "Heine–Borel",
      "Uniform continuity",
      "Extreme value theorem",
    ],
    ["CP1", "CP2", "CP3", "CP4", "CP5", "CP7", "CP8", "CP9"],
  ],
  [
    "subject-topology",
    [
      "Sets",
      "Topological spaces",
      "Open cover",
      "Hausdorff",
      "Connectedness",
      "Separation axioms",
    ],
    ["CP1", "CP2", "CP3", "CP4", "CP5", "CP6"],
  ],
  [
    "subject-linear",
    [
      "Vector spaces",
      "Linear maps",
      "Linear independence",
      "Span",
      "Basis",
      "Rank",
      "Eigenvalues",
      "Diagonalization",
    ],
    ["CP1", "CP5", "CP2", "CP3", "CP4", "CP6", "CP9", "CP10"],
  ],
];
for (const [subjectId, names, codes] of conceptGroups) {
  const project = data.projects.find((p) => p.subjectId === subjectId)!;
  names.forEach((name, index) => {
    const slug = titleSlug(name),
      id = `concept-${slug}`;
    data.concepts.push({
      id,
      slug,
      name,
      blurb:
        name === "Compactness"
          ? "Every open cover has a finite subcover."
          : `A working idea about ${name.toLowerCase()}.`,
      subjectId,
      pinX: null,
      pinY: null,
    });
    data.checkpoints
      .find((cp) => cp.projectId === project.id && cp.code === codes[index])!
      .conceptIds.push(id);
  });
}
const link = (
  from: string,
  to: string,
  kind: "prereq" | "related" = "prereq",
) =>
  data.links.push({
    fromId: `concept-${titleSlug(from)}`,
    toId: `concept-${titleSlug(to)}`,
    kind,
  });
for (const [a, b] of [
  ["Metric spaces", "Open sets"],
  ["Metric spaces", "Sequences"],
  ["Open sets", "Compactness"],
  ["Sequences", "Compactness"],
  ["Open cover", "Compactness"],
  ["Hausdorff", "Compactness"],
  ["Compactness", "Continuity"],
  ["Sets", "Topological spaces"],
  ["Topological spaces", "Open cover"],
  ["Topological spaces", "Hausdorff"],
  ["Topological spaces", "Connectedness"],
  ["Topological spaces", "Separation axioms"],
  ["Vector spaces", "Linear maps"],
  ["Vector spaces", "Span"],
  ["Vector spaces", "Linear independence"],
  ["Span", "Basis"],
  ["Linear independence", "Basis"],
  ["Basis", "Linear maps"],
  ["Linear maps", "Rank"],
  ["Linear maps", "Eigenvalues"],
  ["Eigenvalues", "Diagonalization"],
  ["Compactness", "Heine–Borel"],
  ["Continuity", "Uniform continuity"],
  ["Continuity", "Extreme value theorem"],
])
  link(a, b);
link("Metric spaces", "Topological spaces", "related");
link("Linear maps", "Continuity", "related");
data.misconceptions.push({
  id: "misconception-cover",
  projectId: "project-analysis",
  conceptId: "concept-open-cover",
  label: "open cover vs open set",
  times: 2,
  lastSeenAt: day(1),
  resolvedAt: null,
});
data.sources.push({
  id: "source-rudin",
  projectId: "project-analysis",
  title: "Principles of Mathematical Analysis",
  short: "rudin",
  filename: "rudin.pdf",
  pageCount: 342,
  status: "ready",
  hasText: true,
  outline: Array.from({ length: 11 }, (_, i) => ({
    title: `Chapter ${i + 1}`,
    page: 13 + i * 29,
    level: 0,
  })),
  createdAt: day(100),
  pages: Array.from({ length: 342 }, (_, i) => ({
    page: i + 1,
    label: i < 12 ? String(i + 1) : String(i - 11),
    body: `Demo source page ${i + 1}. This fixture illustrates a mathematical study record; it is not a transcription of the named book.`,
  })),
});
const durations = [
  [38, 38, 38, 120, 120, 122, 42, 42],
  [38, 38, 38, 38, 38, 38, 38, 12, 12, 12, 12, 12, 12, 12, 12, 8],
  [95, 95],
];
for (const [projectIndex, def] of definitions.entries()) {
  durations[projectIndex].forEach((minutes, index) => {
    const number = index + 1,
      open = projectIndex === 0 && number === 8;
    const dayAgo =
      projectIndex === 0
        ? number === 7
          ? 1
          : 28 - number * 3
        : projectIndex === 1
          ? 28 - Math.floor((index * 26) / 15)
          : number === 1
            ? 20
            : 3;
    const activity = open ? ago(120) : day(dayAgo),
      cp =
        projectIndex === 0 && number >= 6
          ? "CP4"
          : `CP${Math.min(number, def.current)}`;
    const events: SessionEvent[] =
      projectIndex === 0 && number === 7
        ? [
            {
              id: 701,
              kind: "pretest",
              body: "What does Hausdorff let us choose around two distinct points?",
              outcome: null,
              hintLevel: null,
              checkpointCode: "CP4",
              createdAt: day(1, 0.5, -40),
            },
            {
              id: 702,
              kind: "attempt",
              body: "Choose disjoint neighborhoods for x and each point y of K.",
              outcome: "partial",
              hintLevel: null,
              checkpointCode: "CP4",
              createdAt: day(1, 0.5, -30),
            },
            {
              id: 703,
              kind: "hint",
              body: "Use compactness to reduce the neighborhoods covering K to finitely many.",
              outcome: null,
              hintLevel: 2,
              checkpointCode: "CP4",
              createdAt: day(1, 0.5, -20),
            },
            {
              id: 704,
              kind: "explanation",
              body: "The finite intersection of neighborhoods of x is open and misses K.",
              outcome: "partial",
              hintLevel: null,
              checkpointCode: "CP4",
              createdAt: day(1, 0.5, -2),
            },
          ]
        : [];
    const session: DemoSession = {
      id: `${def.id}-session-${number}`,
      projectId: def.id,
      number,
      goal:
        projectIndex === 0 && number === 7
          ? "Prove compact sets in a Hausdorff space are closed"
          : `Practice ${def.titles[Math.min(number, def.current) - 1].toLowerCase()}`,
      checkpointCode: cp,
      client: "claude",
      state: open ? "open" : "ended",
      goalMet: open ? null : "yes",
      style: "socratic",
      startedAt: open ? ago(120 + minutes) : day(dayAgo, 0.5, -minutes),
      lastActivityAt: activity,
      minutes,
      summaryText: open
        ? null
        : "Built the argument with careful attention to the hypotheses.",
      resumeQuestion: open
        ? "Why is a finite subcover enough to separate x from K?"
        : null,
      resumeStep: open ? 2 : null,
      events,
      pages: projectIndex === 0 ? "36-38" : null,
    };
    data.sessions.push(session);
  });
}
const baseState = (offset: number): CardState => ({
  state: 2,
  due: due(offset),
  stability: 14,
  difficulty: 5,
  lastReview: day(4),
  step: 0,
  reps: 12,
  lapses: 1,
});
for (let no = 1; no <= 90; no++) {
  const projectIndex = no <= 48 ? 0 : no <= 78 ? 1 : 2,
    def = definitions[projectIndex];
  let code =
    projectIndex === 0
      ? no <= 10 && no !== 7
        ? "CP4"
        : no >= 11 && no <= 15
          ? "CP3"
          : `CP${1 + (no % 12)}`
      : projectIndex === 1
        ? "CP9"
        : "CP2";
  if (no === 7) code = "CP7";
  const today =
    projectIndex === 0
      ? (no <= 10 && no !== 7) || (no >= 11 && no <= 15)
      : projectIndex === 1
        ? no <= 54
        : no <= 81;
  const tomorrow =
    projectIndex === 0
      ? no >= 16 && no <= 25
      : projectIndex === 1
        ? no >= 55 && no <= 60
        : no >= 82 && no <= 83;
  const sessionNumber =
    no === 1
      ? 7
      : projectIndex === 0
        ? 1 + (no % 6)
        : projectIndex === 1
          ? 1 + (no % 16)
          : 1 + (no % 2);
  const cp = data.checkpoints.find(
    (cp) => cp.projectId === def.id && cp.code === code,
  )!;
  const kind: NoteKind =
    no === 7 ? "theorem" : no % 3 === 0 ? "why" : "definition";
  const examples = mathPrompts[`${def.slug}:${cp.title}`];
  if (!examples?.length) throw new Error(`Missing genuine demo card for ${def.slug} / ${cp.title}`);
  const example = examples[(no - 1) % examples.length];
  const note: DemoNote = {
    projectId: def.id,
    sessionId: `${def.id}-session-${sessionNumber}`,
    conceptId:
      no >= 26 && no <= 28
        ? ["concept-open-cover", "concept-open-sets", "concept-hausdorff"][
            no - 26
          ]
        : (cp.conceptIds[0] ?? null),
    note: {
      noteId: `note-${no}`,
      noteNo: no,
      front:
        no === 7
          ? "State the Heine–Borel theorem."
          : no === 1
            ? "Why does a finite intersection of open neighborhoods remain open?"
            : example[0],
      back:
        no === 7
          ? "A subset of $\\mathbb{R}^n$ is compact if and only if it is closed and bounded."
          : example[1],
      type: "basic",
      kind,
      tags: [def.slug],
      status: "active",
      origin: "claude",
      projectSlug: def.slug,
      checkpointCode: code,
      sessionNumber,
      sourceShort: projectIndex === 0 ? "rudin" : null,
      pageLabel: projectIndex === 0 ? "40" : null,
    },
    cards: [
      {
        id: `card-${no}-1`,
        ord: 1,
        state: baseState(today ? 0 : tomorrow ? 1 : 7),
      },
    ],
    comments: [],
  };
  if (no === 7)
    note.comments = [
      {
        no: 1,
        body: "Too wordy. Make the hypotheses a cloze.",
        status: "open",
        createdAt: ago(120),
        resolvedAt: null,
        resolvedByOrigin: null,
      },
      {
        no: 2,
        body: "State the ambient space.",
        status: "addressed",
        createdAt: day(5),
        resolvedAt: day(4),
        resolvedByOrigin: "claude",
      },
    ];
  data.notes.push(note);
}
// Last 30 days: 412 attempts, 375 recalled; confidence 150/160, 20/28, 6/16.
for (let i = 0; i < 1300; i++) {
  const recent = i < 412,
    dayAgo = recent ? i % 30 : 30 + ((i - 412) % 60);
  let confidence: Confidence = null,
    right: boolean;
  if (recent) {
    if (i < 160) {
      confidence = "sure";
      right = i < 150;
    } else if (i < 188) {
      confidence = "unsure";
      right = i - 160 < 20;
    } else if (i < 204) {
      confidence = "guess";
      right = i - 188 < 6;
    } else right = i - 204 < 199;
  } else {
    right = random() < 0.89;
    confidence = random() < 0.5 ? "sure" : null;
  }
  const rating: Rating = right
    ? random() < 0.12
      ? 4
      : random() < 0.18
        ? 2
        : 3
    : 1;
  const fraction = right ? 0.65 + random() * 0.3 : 0.1 + random() * 0.4;
  data.reviews.push({
    id: i + 1,
    cardId: "",
    projectId: "",
    reviewedAt: day(dayAgo, fraction),
    rating,
    stateBefore: 2,
    confidence,
    durationMs: 15000 + Math.floor(random() * 20000),
    prev: baseState(0),
    undoneAt: null,
  });
}
// Assign backwards so every card's newest exposure is a successful recall. Recent lapses
// belong to the three already-revisit concepts and do not manufacture extra Atlas warnings.
const sorted = [...data.reviews].sort((a, b) => {
  const [, ad, af] = a.reviewedAt.split(":"),
    [, bd, bf] = b.reviewedAt.split(":");
  return Number(bd) - Number(ad) || Number(bf) - Number(af);
});
const unassigned = [...data.notes],
  seen: DemoNote[] = [];
for (const review of sorted) {
  const dayAgo = -Number(review.reviewedAt.split(":")[1]);
  let note: DemoNote;
  if (review.rating === 1 && dayAgo <= 14)
    note = data.notes[25 + (review.id % 3)];
  else if (
    review.rating > 1 &&
    unassigned.length &&
    (unassigned[0].note.noteNo <= 28 || random() < 0.35 || seen.length === 0)
  ) {
    note = unassigned.shift()!;
    review.rating = 3;
    seen.push(note);
  } else note = seen[Math.floor(random() * seen.length)] ?? data.notes[0];
  review.cardId = note.cards[0].id;
  review.projectId = note.projectId;
}
const fallbackCandidates = sorted.filter((r) => r.rating > 1);
for (const note of unassigned) {
  const candidate = fallbackCandidates.pop()!;
  candidate.cardId = note.cards[0].id;
  candidate.projectId = note.projectId;
}
[...sorted].reverse().forEach((review, index) => (review.id = index + 1));
data.reviews.sort((a, b) => a.id - b.id);
const cards = [
  {
    front: "Why must $U_y$ and $V_y$ be disjoint?",
    back: "So the intersection of finitely many $V_y$ is an open set around $x$ that misses $K$.",
    kind: "why",
    type: "basic",
    reason: "From your step 2 hint",
  },
  {
    front: "A compact subset of a Hausdorff space is always…?",
    back: "closed.",
    kind: "theorem",
    type: "basic",
    reason: "Your session goal, as a card",
  },
  {
    front: "A compact set that is not closed?",
    back: "In the Sierpiński space $\\{0,1\\}$ with opens $\\varnothing,\\{1\\},\\{0,1\\}$, the set $\\{1\\}$ is compact but not closed.",
    kind: "counterexample",
    type: "basic",
    reason: "Shows why Hausdorff matters",
  },
  {
    front:
      "$K$ is {{c1::compact}} if every open cover of $K$ has a {{c2::finite subcover}}.",
    back: "",
    kind: "definition",
    type: "cloze",
    reason: "Fixes the open cover mix-up",
  },
  {
    front: "When is $\\lambda$ an eigenvalue of $A$?",
    back: "When $Av=\\lambda v$ for some $v\\ne0$.",
    kind: "definition",
    type: "basic",
    reason: "You asked for this one",
  },
] as const;
cards.forEach((c, i) =>
  data.proposals.push({
    id: `proposal-${i + 1}`,
    kind: "card",
    projectSlug: i === 4 ? "linear-algebra" : "real-analysis",
    projectGlyph: i === 4 ? "λ" : "∫",
    sessionNumber: i === 4 ? 12 : 7,
    origin: "claude",
    reason: c.reason,
    createdAt: day(1, 0.5, i),
    card: {
      front: c.front,
      back: c.back,
      kind: c.kind,
      type: c.type,
      checkpoint: i === 4 ? "CP9" : "CP4",
      concept: i === 4 ? "eigenvalues" : "compactness",
      source: i === 4 ? undefined : "rudin",
      page: i === 4 ? undefined : "40",
      tags: [],
    },
    cardEdit: null,
    plan: null,
    planChange: null,
    status: "pending",
  }),
);
data.proposals.push({
  id: "proposal-6",
  kind: "plan_change",
  projectSlug: "real-analysis",
  projectGlyph: "∫",
  sessionNumber: 7,
  origin: "claude",
  reason: "Same gap in S6 and S7",
  createdAt: day(1, 0.5, 6),
  card: null,
  cardEdit: null,
  plan: null,
  planChange: {
    ops: [
      {
        op: "add",
        after: "CP4",
        code: "CP4a",
        title: "Finite subcover lemma",
        objective: "Use a finite subcover in the separation argument.",
        criterion:
          "Constructs a finite subcover unaided and explains why finiteness matters.",
        steps: [
          "Choose the finite cover",
          "Intersect the neighborhoods",
          "Check disjointness",
        ],
        prereqs: ["CP4"],
        concepts: ["Open cover"],
        recheck_prompt: "Where is finiteness used?",
      },
      { op: "prereq_add", code: "CP5", prereq: "CP4a" },
    ],
  },
  status: "pending",
});
writeFileSync(
  new URL("../src/data/demo/fixture.json", import.meta.url),
  JSON.stringify(data) + "\n",
);
console.log(
  `Seed ${SEED}: ${data.projects.length} projects, ${data.notes.length} notes, ${data.reviews.length} reviews, ${data.concepts.length} concepts`,
);
