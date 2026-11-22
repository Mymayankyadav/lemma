import { VIEWPORT, type SyntheticTrace } from "./tutor-ink-fixtures.ts";

type Point = readonly [number, number];
type Path = readonly Point[];
type Paths = readonly Path[];
type Prototype = Pick<SyntheticTrace, "name" | "kind" | "intended" | "drawn" | "extensions" | "condition"> & { paths: Paths };
type Cohort = NonNullable<SyntheticTrace["prototypeCohort"]>;

const less: Path = [[83,14],[67,26],[22,48],[15,53],[24,58],[59,73],[84,79]];
const greater: Path = [[17,23],[49,31],[80,45],[86,51],[73,62],[18,84],[14,81]];
const subset: Path = [[85,24],[61,20],[35,23],[19,37],[17,55],[28,69],[49,74],[77,72],[85,68]];
const superset: Path = [[17,22],[51,19],[67,24],[81,37],[83,53],[71,69],[47,76],[19,75]];
const member: Paths = [
  [[82,21],[54,18],[28,26],[17,48],[23,69],[43,82],[66,82],[85,75]],
  [[64,50],[43,49],[23,52]],
];
const lower: Path = [[23,92],[39,89],[59,90],[78,94]];
const slash: Path = [[67,13],[56,29],[45,55],[30,82],[30,87]];
const equal: Paths = [[[22,37],[47,34],[71,35],[86,39]],[[79,64],[63,64],[42,67],[20,67]]];

const sharedInk: Readonly<Record<string, Paths>> = {
  forall: [[[23,12],[30,38],[43,74],[48,81],[54,73],[71,36],[82,18]],[[67,46],[54,44],[35,45]]],
  exists: [[[19,23],[46,21],[75,22],[80,28],[76,61],[79,82],[54,86],[25,83]],[[30,53],[47,52],[76,55]]],
  "element-of": member,
  "not-element-of": [slash,...member],
  "less-than": [less],
  "less-than-or-equal": [less,lower],
  "greater-than": [greater],
  "greater-than-or-equal": [greater,[[22,92],[54,90],[81,89]]],
  equal,
  "not-equal": [slash,...equal],
  subset: [subset],
  "subset-or-equal": [lower,subset],
  superset: [superset],
  "superset-or-equal": [superset,[[23,92],[59,94],[85,90]]],
  union: [[[20,15],[19,34],[27,65],[35,78],[52,84],[69,76],[78,55],[79,21]]],
  intersection: [[[24,85],[23,57],[27,34],[41,21],[57,19],[70,24],[78,40],[77,82]]],
  "empty-set": [
    [[51,18],[35,20],[22,30],[18,48],[22,67],[36,80],[58,83],[76,74],[85,60],[83,38],[69,22],[48,19]],
    [[20,85],[42,61],[64,38],[85,15]],
  ],
  infinity: [[[51,46],[34,29],[21,32],[11,47],[13,60],[24,68],[38,63],[53,44],[67,29],[80,32],[89,45],[91,55],[82,66],[67,66],[50,49]]],
  integral: [[[76,16],[65,11],[57,16],[51,32],[49,62],[43,80],[34,90],[26,88],[23,83]]],
  "right-arrow": [[[12,52],[47,50],[88,51],[76,45],[65,34]],[[88,51],[74,62],[67,68]]],
  implies: [[[14,38],[53,40],[77,38]],[[18,60],[50,60],[80,58]],[[69,23],[88,43],[94,49],[81,56],[69,72]]],
  alpha: [[[67,29],[53,22],[35,25],[23,40],[20,58],[28,71],[41,73],[54,64],[71,34],[74,25],[68,55],[70,68],[81,74]]],
  epsilon: [[[78,28],[61,20],[46,20],[30,27],[29,41],[44,50],[66,50],[48,49],[33,55],[27,65],[38,76],[58,78],[77,70]]],
  pi: [[[17,31],[26,27],[55,25],[88,29]],[[35,26],[35,45],[30,71],[20,77]],[[66,26],[62,47],[63,68],[72,75],[79,72]]],
};

const relations = new Map<string, string>([
  ["less-than","less-than-or-equal"], ["greater-than","greater-than-or-equal"], ["equal","not-equal"],
  ["element-of","not-element-of"], ["subset","subset-or-equal"], ["superset","superset-or-equal"],
]);

function complete(name: string, id: string, paths: Paths): Prototype {
  const extension = relations.get(id);
  return { name, intended:id, drawn:id, kind:"complete", condition:"completed", paths,
    ...(extension ? { extensions:[extension] } : {}) };
}

function pending(name: string, intended: string, paths: Paths, drawn?: string, additional: string[] = []): Prototype {
  return { name, intended, drawn, kind:"partial", condition:"pending-stroke", paths, extensions:[intended,...additional] };
}

const shared: Prototype[] = [
  ...Object.entries(sharedInk).map(([id, paths]) => complete(`native-${id}`, id, paths)),
  ...[...relations].map(([short, long]) => pending(`pending-${long}`, long, sharedInk[short], short)),
  pending("stopped-on-lower-mark", "less-than-or-equal", [less,[[23,92],[37,91],[46,90]]], "less-than"),
  pending("first-bowed-equals-bar", "equal", [equal[0]], undefined, ["not-equal"]),
  pending("element-opening-curve", "not-element-of", [subset], "subset", ["element-of"]),
  { name:"quantifier-bar-missed", kind:"ambiguous", intended:"forall", condition:"missed-stroke", paths:[sharedInk.forall[0]] },
  { name:"existence-middle-missed", kind:"ambiguous", intended:"exists", condition:"missed-stroke", paths:[sharedInk.exists[0]] },
  { name:"member-double-slash", kind:"ambiguous", intended:"not-element-of", condition:"extra-stroke",
    paths:[...member,slash,[[83,19],[69,37],[54,64],[44,77]]] },
  { name:"corrected-greater-angle", kind:"ambiguous", intended:"greater-than", condition:"overwritten",
    paths:[greater,[[22,28],[63,38],[84,51],[52,65],[17,74]]] },
  { name:"equal-stray-tail", kind:"ambiguous", intended:"equal", condition:"extra-stroke",
    paths:[...equal,[[64,66],[63,76],[60,86]]] },
  { name:"handwritten-question-mark", kind:"unsupported", condition:"outside-catalogue",
    paths:[[[30,30],[34,22],[49,17],[64,20],[71,32],[65,43],[51,53],[47,66]],[[47,81]]] },
  { name:"handwritten-number-sign", kind:"unsupported", condition:"outside-catalogue",
    paths:[[[43,17],[37,44],[30,84]],[[73,20],[67,51],[61,88]],[[19,43],[80,39]],[[18,65],[79,60]]] },
  { name:"quick-at-sign", kind:"unsupported", condition:"outside-catalogue",
    paths:[[[74,34],[59,28],[44,33],[37,47],[39,62],[50,69],[62,58],[68,35],[64,63],[74,69],[84,53],[81,30],[69,19],[48,15],[27,25],[15,47],[22,72],[43,87],[66,88],[84,79]]] },
  { name:"fast-cancel-scribble", kind:"unsupported", condition:"outside-catalogue",
    paths:[[[24,21],[81,34],[29,51],[73,65],[25,79],[68,81],[40,61],[58,22]]] },
  { name:"exists-intended-forall-drawn", kind:"wrong-intent", intended:"exists", drawn:"forall", condition:"different-glyph", paths:sharedInk.forall },
  { name:"subset-intended-superset-drawn", kind:"wrong-intent", intended:"subset", drawn:"superset", condition:"different-glyph", paths:[superset] },
  { name:"member-intended-epsilon-drawn", kind:"wrong-intent", intended:"element-of", drawn:"epsilon", condition:"different-glyph", paths:sharedInk.epsilon },
  { name:"empty-pad", kind:"invalid", condition:"empty", paths:[] },
  { name:"momentary-touch", kind:"invalid", condition:"point", paths:[[[51,48]]] },
  { name:"landing-flick", kind:"invalid", condition:"stray-flick", paths:[[[47,48],[49,50],[51,48],[51,46]]] },
];

const tuningOnly: Prototype[] = [
  complete("separate-quantifier-legs", "forall", [[[25,14],[37,50],[51,86]],[[51,86],[67,42],[78,17]],[[36,47],[64,47]]]),
  complete("angular-two-part-exists", "exists", [[[22,19],[76,20],[76,48],[37,49]],[[77,48],[78,80],[26,81]]]),
  complete("rounded-member-with-wide-bar", "element-of", [member[0],[[23,46],[51,50],[82,48]]]),
  complete("three-part-footed-pi", "pi", [[[15,33],[89,28]],[[34,33],[30,61],[25,75]],[[64,30],[63,61],[70,72],[82,69]]]),
  complete("joined-arrow", "right-arrow", [[[10,48],[81,50],[60,33],[87,50],[65,71],[71,64]]]),
  complete("offset-loops-infinity", "infinity", [[[48,43],[64,24],[79,28],[86,43],[84,58],[71,65],[52,53],[32,32],[17,34],[11,49],[20,66],[34,63],[47,44]]]),
];

const heldOut: Prototype[] = [
  complete("continuous-rounded-exists", "exists",
    [[[22,24],[47,18],[68,22],[77,30],[73,47],[59,54],[31,52],[58,51],[75,58],[80,72],[73,82],[49,86],[22,82]]]),
  complete("one-lift-pi", "pi", [[[18,37],[26,28],[56,25],[86,27],[67,27],[65,54],[69,70],[80,75]],[[39,28],[36,57],[27,76]]]),
  complete("angular-alpha-with-open-tail", "alpha", [[[65,36],[51,26],[31,31],[23,54],[32,71],[48,72],[65,48],[71,23],[66,44],[67,67],[79,79]]]),
  complete("short-bowed-equals", "equal", [[[29,39],[41,36],[53,37],[70,42]],[[28,68],[49,64],[73,67]]]),
  complete("slash-last-offset-not-equal", "not-equal", [[[24,41],[49,35],[80,39]],[[27,67],[51,64],[73,63]],[[67,19],[58,33],[48,56],[34,83]]]),
  complete("open-slash-first-empty-set", "empty-set", [[[20,83],[47,51],[81,20]],[[66,23],[43,18],[28,25],[17,43],[21,64],[39,81],[63,81],[79,67],[83,46],[72,29]]]),
  complete("slanted-shorter-inequality-bar", "greater-than-or-equal", [greater,[[79,86],[67,85],[54,88],[43,91]]]),
  complete("approximately-long-and-short", "approximately-equal", [[[12,40],[25,31],[37,30],[51,40],[66,44],[79,40],[88,32]],[[18,67],[29,60],[42,60],[55,68],[69,69],[82,61]]]),
  complete("continuous-partial-derivative", "partial", [[[37,21],[55,15],[69,22],[77,37],[74,57],[61,74],[42,81],[29,72],[27,59],[36,49],[50,47],[66,54]]]),
  complete("slanted-parallel", "parallel", [[[40,17],[38,42],[35,70],[31,83]],[[66,14],[64,41],[59,79]]]),
  pending("flattened-left-angle-prefix", "less-than-or-equal", [[[80,23],[46,32],[24,44],[20,53],[31,61],[73,70]]], "less-than"),
  pending("slashed-equals-before-second-bar", "not-equal", [slash,equal[0]]),
  { name:"partial-arrow-head-missed", kind:"ambiguous", intended:"right-arrow", condition:"missed-stroke", paths:[sharedInk["right-arrow"][0]] },
  { name:"member-with-retraced-bar", kind:"ambiguous", intended:"element-of", condition:"overwritten",
    paths:[member[0],member[1],[[67,51],[50,53],[40,60],[24,54]]] },
];

type Style = Readonly<{
  name: string; pointerType: "touch" | "pen"; width: number; height: number; angle: number; shear: number;
  tremor: number; bow: number; hook: number; speed: number; hesitation: number;
}>;

const styles = {
  tuning: [
    { name:"rounded-thumb", pointerType:"touch", width:.91, height:.81, angle:-.12, shear:.10, tremor:1.1, bow:2.5, hook:.24, speed:7, hesitation:.12 },
    { name:"narrow-pen", pointerType:"pen", width:.75, height:.91, angle:.05, shear:-.06, tremor:.34, bow:.7, hook:.32, speed:4, hesitation:.10 },
    { name:"fast-index", pointerType:"touch", width:.84, height:.85, angle:.13, shear:.09, tremor:1.1, bow:2.8, hook:.37, speed:9, hesitation:.10 },
    { name:"wide-pencil", pointerType:"pen", width:1.02, height:.74, angle:-.08, shear:.08, tremor:.60, bow:1.6, hook:.45, speed:5, hesitation:.30 },
    { name:"compact-thumb", pointerType:"touch", width:.70, height:.69, angle:.08, shear:-.08, tremor:1.7, bow:2.2, hook:.32, speed:5, hesitation:.28 },
    { name:"hesitant-pen", pointerType:"pen", width:.86, height:.85, angle:.03, shear:.07, tremor:.67, bow:1.3, hook:.28, speed:4, hesitation:.54 },
  ],
  test: [
    { name:"skewed-thumb", pointerType:"touch", width:1.02, height:.76, angle:.17, shear:.19, tremor:1.1, bow:2.4, hook:.35, speed:8, hesitation:.19 },
    { name:"left-leaning-pen", pointerType:"pen", width:.81, height:.91, angle:-.13, shear:-.16, tremor:.46, bow:1.1, hook:.29, speed:5, hesitation:.18 },
    { name:"bowed-index", pointerType:"touch", width:.86, height:.88, angle:-.10, shear:.09, tremor:1.8, bow:3.4, hook:.36, speed:6, hesitation:.25 },
    { name:"long-tail-pen", pointerType:"pen", width:.90, height:.87, angle:.12, shear:.07, tremor:.73, bow:1.4, hook:.69, speed:6, hesitation:.36 },
    { name:"small-rapid-index", pointerType:"touch", width:.68, height:.71, angle:.16, shear:.13, tremor:1.45, bow:2.5, hook:.31, speed:8, hesitation:.26 },
    { name:"stop-start-thumb", pointerType:"touch", width:.95, height:.83, angle:-.15, shear:-.09, tremor:1.4, bow:2.7, hook:.35, speed:4, hesitation:.61 },
  ],
} as const satisfies Readonly<Record<SyntheticTrace["split"], readonly Style[]>>;

export const HUMANLIKE_SEEDS = { tuning: 0x8f32041d, test: 0xdad3a761 } as const;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function strokePath(path: Path, style: Style, next: () => number): Point[] {
  if (path.length < 2) return [...path];
  const [start,end] = [path[0],path.at(-1)!];
  const direction = Math.abs(end[0]-start[0]) > Math.abs(end[1]-start[1]);
  // Small changes to a straight mark alter its length and bow without distorting nearby strokes together.
  const straight = path.length <= 4 && Math.hypot(end[0]-start[0],end[1]-start[1]) > 14;
  const lengthScale = straight ? .88 + next() * .25 : 1;
  const bow = straight ? (next() - .5) * 2 * style.bow : 0;
  const offsetX = (next()-.5)*2.4, offsetY = (next()-.5)*2.5;
  const changed = path.map(([x,y],index):Point => {
    const arc = Math.sin(index/(path.length-1)*Math.PI)*bow;
    return [start[0]+(x-start[0])*lengthScale+offsetX+(direction?0:arc),
      start[1]+(y-start[1])*lengthScale+offsetY+(direction?arc:0)];
  });
  if (straight && next()<.26) changed.reverse();
  if (next() < style.hook && Math.hypot(end[0]-start[0],end[1]-start[1]) > 23) {
    const [x,y] = changed.at(-1)!;
    const [beforeX,beforeY] = changed.at(-2)!;
    const length = Math.hypot(x-beforeX,y-beforeY) || 1;
    const u = (x-beforeX)/length, v = (y-beforeY)/length;
    const overshoot = 1.2+next()*2.6, turn = (next()-.5)*4.5;
    changed.push([x+u*overshoot-v*turn, y+v*overshoot+u*turn]);
  }
  return changed;
}

function render(paths: Paths, style: Style, next: () => number): SyntheticTrace["strokes"] {
  const angle = style.angle+(next()-.5)*.12;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const centerX = 160+(next()-.5)*48, centerY = 58+(next()-.5)*12;
  const scale = .92+next()*.17;
  let time = 0;
  return paths.map(path => {
    const anchors = strokePath(path,style,next);
    const phase = next()*Math.PI*2;
    const points: SyntheticTrace["strokes"][number]["points"][number][] = [];
    for (const [index,[x,y]] of anchors.entries()) {
      const [previousX,previousY] = anchors[Math.max(0,index-1)];
      const length = Math.hypot(x-previousX,y-previousY);
      const count = index === 0 ? 1 : Math.max(2, Math.ceil(length/(style.speed*(.70+next()*.65))));
      const turnEase = style.hesitation*(.7+.4*next());
      if (index > 0 && next()<style.hesitation*.23) time+=10+next()*27;
      for (let sample = 1; sample <= count; sample++) {
        const t = sample/count;
        const fraction = t*(1-turnEase) + turnEase*t*t*(3-2*t);
        const progress = (Math.max(0,index-1)+fraction)/Math.max(1,anchors.length-1);
        const wobble = Math.sin(phase+2*Math.PI*1.4*progress);
        const sway = Math.cos(phase*.61+2*Math.PI*.85*progress);
        const px = previousX+(x-previousX)*fraction-50;
        const py = previousY+(y-previousY)*fraction-50;
        const u = scale*(style.width*px+style.shear*py), v = scale*style.height*py;
        points.push({
          x: Math.max(0, Math.min(VIEWPORT.width, centerX + u*cos-v*sin + style.tremor*wobble)),
          y: Math.max(0, Math.min(VIEWPORT.height, centerY + u*sin+v*cos + style.tremor*sway)),
          t: time += 8 + next()*10,
        });
      }
    }
    time+=35+next()*(115*style.hesitation+28);
    return { pointerType:style.pointerType, points };
  });
}

export function humanlikeTraces(): SyntheticTrace[] {
  return (["tuning","test"] as const).flatMap(split => {
    const cohorts: readonly [Cohort,Prototype[]][] = [
      ["shared",shared], split === "tuning" ? ["tuning-only",tuningOnly] : ["held-out",heldOut],
    ];
    const next = seededRandom(HUMANLIKE_SEEDS[split]);
    return styles[split].flatMap(style => cohorts.flatMap(([prototypeCohort,prototypes]) =>
      prototypes.map(({paths,...prototype}):SyntheticTrace => ({
        ...prototype, prototypeCohort, split, style:style.name,
        id:`humanlike-${split}-${style.name}-${prototype.name}`, strokes:render(paths,style,next),
      }))));
  });
}
