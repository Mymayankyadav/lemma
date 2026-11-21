import type { InkStroke } from "../../src/features/tutor/input/types";

type Point = readonly [number, number];
type Paths = readonly (readonly Point[])[];
export type CaseKind = "complete" | "partial" | "ambiguous" | "unsupported" | "wrong-intent" | "invalid";
type Fixture = {
  name: string;
  kind: CaseKind;
  paths: Paths;
  intended?: string;
  drawn?: string;
  extensions?: readonly string[];
};

const left: readonly Point[] = [[83,18],[17,48],[83,78]];
const mirror = (stroke: readonly Point[]): Point[] => stroke.map(([x,y]) => [100-x,y]);
const right = mirror(left);
const lowerBar: readonly Point[] = [[17,92],[83,92]];
const equal: Paths = [[[18,34],[82,34]],[[18,67],[82,67]]];
const slash: readonly Point[] = [[72,12],[31,89]];
const subset: readonly Point[] = [[83,18],[47,18],[26,25],[17,43],[20,61],[35,73],[55,77],[83,77]];
const superset = mirror(subset);
const member: Paths = [subset,[[19,48],[72,47]]];
const forall: Paths = [[[18,15],[50,85],[82,15]],[[31,45],[69,45]]];
const circle: readonly Point[] = [[50,14],[72,20],[85,40],[85,59],[73,79],[50,86],[28,79],[15,59],[15,40],[28,21],[50,14]];

const completed: Readonly<Record<string, Paths>> = {
  forall,
  exists: [[[82,18],[26,18]],[[82,18],[82,83]],[[28,50],[82,50]],[[26,83],[82,83]]],
  "element-of": member,
  "not-element-of": [...member,slash],
  "less-than": [left],
  "less-than-or-equal": [left,lowerBar],
  "greater-than": [right],
  "greater-than-or-equal": [right,lowerBar],
  equal,
  "not-equal": [...equal,slash],
  subset: [subset],
  "subset-or-equal": [subset,lowerBar],
  superset: [superset],
  "superset-or-equal": [superset,lowerBar],
  union: [[[22,17],[22,58],[28,74],[42,83],[58,83],[72,74],[78,58],[78,17]]],
  intersection: [[[22,83],[22,42],[28,26],[42,17],[58,17],[72,26],[78,42],[78,83]]],
  "empty-set": [circle,slash],
  infinity: [[[50,50],[63,31],[77,28],[90,38],[92,53],[84,69],[71,72],[60,64],[50,50],[40,35],[25,28],[12,37],[9,51],[16,66],[28,72],[42,61],[50,50]]],
  integral: [[[69,12],[58,12],[52,18],[49,33],[47,54],[44,76],[39,87],[32,89],[25,87]]],
  "right-arrow": [[[10,50],[89,50]],[[65,25],[91,50],[65,75]]],
  implies: [[[13,38],[85,38]],[[13,62],[85,62]],[[66,21],[92,50],[66,80]]],
  alpha: [[[77,76],[65,63],[58,40],[46,26],[29,26],[19,40],[17,59],[24,72],[36,76],[49,68],[61,51],[74,26]]],
  epsilon: [[[75,25],[57,17],[42,20],[32,30],[34,40],[46,49],[64,49]],[[46,49],[31,57],[29,69],[39,79],[57,84],[76,76]]],
  pi: [[[12,24],[27,21],[88,21]],[[33,22],[32,49],[27,78]],[[67,22],[66,77]]],
};

const longer = [
  ["less-than","less-than-or-equal"],["greater-than","greater-than-or-equal"],
  ["element-of","not-element-of"],["equal","not-equal"],
  ["subset","subset-or-equal"],["superset","superset-or-equal"],
] as const;

const fixtures: Fixture[] = [
  ...Object.entries(completed).map(([id, paths]): Fixture => ({
    name:id, kind:"complete", paths, intended:id, drawn:id,
    extensions:longer.filter(([short])=>short===id).map(([,long])=>long),
  })),
  ...longer.map(([short,long]): Fixture => ({
    name:long+"-before-last-stroke", kind:"partial", intended:long, drawn:short,
    paths:completed[short], extensions:[long],
  })),
  { name:"left-angle-halfway", kind:"partial", intended:"less-than-or-equal", paths:[[left[0],left[1],[47,62]]], extensions:["less-than-or-equal"] },
  { name:"member-without-midbar", kind:"partial", intended:"not-element-of", drawn:"subset", paths:[subset], extensions:["not-element-of","element-of"] },
  { name:"short-stroke-before-equals", kind:"partial", intended:"equal", paths:[equal[0].slice()], extensions:["equal","not-equal"] },
  { name:"less-or-equal-incomplete-bar", kind:"partial", intended:"less-than-or-equal", drawn:"less-than", paths:[left,[[17,92],[46,92]]], extensions:["less-than-or-equal"] },
  { name:"extra-stroke-across-member", kind:"ambiguous", paths:[...member,[[45,38],[62,61]]] },
  { name:"flat-angle", kind:"ambiguous", paths:[[[83,32],[17,48],[83,64]]] },
  { name:"broken-quantifier", kind:"ambiguous", paths:[forall[0],[[34,52],[45,51]]] },
  { name:"rough-set-curve", kind:"ambiguous", paths:[[[58,19],[34,38],[27,54],[41,73],[66,80],[77,68]]] },
  { name:"copyright-sign", kind:"unsupported", paths:[circle,[[63,38],[49,33],[39,41],[39,58],[49,65],[64,61]]] },
  { name:"sharp-sign", kind:"unsupported", paths:[[[40,18],[27,85]],[[70,17],[58,85]],[[18,42],[85,33]],[[14,66],[80,57]]] },
  { name:"quotation-mark", kind:"unsupported", paths:[[[41,16],[34,44]],[[65,16],[58,44]]] },
  { name:"square-scribble", kind:"unsupported", paths:[[[18,20],[82,20],[82,82],[18,82],[18,20],[51,64],[68,30]]] },
  { name:"spiral-scribble", kind:"unsupported", paths:[[[21,20],[48,13],[72,18],[86,37],[85,60],[69,77],[48,82],[28,71],[24,51],[33,37],[49,32],[64,37],[71,48],[61,61],[49,59],[44,53]]] },
  { name:"mu-intended-infinity-actually-drawn", kind:"wrong-intent", intended:"mu", drawn:"infinity", paths:completed.infinity },
  { name:"exists-intended-forall-actually-drawn", kind:"wrong-intent", intended:"exists", drawn:"forall", paths:forall },
  { name:"not-member-intended-empty-set-actually-drawn", kind:"wrong-intent", intended:"not-element-of", drawn:"empty-set", paths:completed["empty-set"] },
  { name:"empty", kind:"invalid", paths:[] },
  { name:"single-dot", kind:"invalid", paths:[[[50,50]]] },
  { name:"tiny-flick", kind:"invalid", paths:[[[49,49],[50,50],[51,49]]] },
];

export const CORPUS_STYLES = { tuning: 0x24c8a225, test: 0x983a887e } as const;
const WRITERS_PER_SPLIT = 10;
export const VIEWPORT = { width: 320, height: 116 };

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export type SyntheticTrace = Omit<Fixture, "paths"> & {
  id: string;
  split: keyof typeof CORPUS_STYLES;
  style: string;
  strokes: InkStroke[];
  prototypeCohort?: "shared" | "tuning-only" | "held-out";
  condition?: string;
};

export function syntheticTraces(): SyntheticTrace[] {
  const traces: SyntheticTrace[] = [];
  for (const [split, seed] of Object.entries(CORPUS_STYLES) as [SyntheticTrace["split"], number][]) {
    const next = seededRandom(seed);
    for (let index = 0; index < WRITERS_PER_SPLIT; index++) {
      const rough = index >= 7;
      const angle = (next() - .5) * (rough ? .64 : .34);
      const shear = (next() - .5) * (rough ? .42 : .23);
      const width = .76 + next() * .27;
      const height = .76 + next() * .24;
      const wobble = .3 + next() * (rough ? 6 : 2.5);
      const style = `${split}-${rough ? "rough" : "steady"}-${index + 1}`;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const { paths, ...fixture } of fixtures) {
        const centerX = 160 + (next() - .5) * 42, centerY = 58 + (next() - .5) * 12;
        const order = paths.map(stroke => next() < .4 ? [...stroke].reverse() : stroke);
        if (next() < .35) order.reverse();
        let time = 0;
        const strokes = order.map(stroke => {
          const transformed = stroke.map(([x, y]) => {
            const u = width * (x - 50) + shear * (y - 50), v = height * (y - 50);
            return [centerX + u*cos - v*sin + (next()-.5)*wobble, centerY + u*sin + v*cos + (next()-.5)*wobble];
          });
          const points = [];
          for (let point = 0; point < transformed.length; point++) {
            const [x,y] = transformed[point];
            const [lastX,lastY] = transformed[Math.max(0,point-1)];
            const samples = point === 0 ? 1 : Math.max(2, Math.ceil(Math.hypot(x-lastX,y-lastY)/10));
            for (let step = 1; step <= samples; step++) {
              const fraction=step/samples;
              const bend=Math.sin(fraction*Math.PI)*(next()-.5)*wobble;
              points.push({
                x:Math.min(VIEWPORT.width,Math.max(0,lastX+(x-lastX)*fraction+bend)),
                y:Math.min(VIEWPORT.height,Math.max(0,lastY+(y-lastY)*fraction+bend)),
                t:(time += 8 + next()*12),
              });
            }
          }
          time+=30+next()*65;
          return { pointerType:"touch" as const, points };
        });
        traces.push({ ...fixture, split, style, id:`${style}-${fixture.name}`, strokes });
      }
    }
  }
  return traces;
}
