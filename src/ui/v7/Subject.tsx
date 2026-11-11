import { Emblem } from "./Emblem";
export const subjects = ["Analysis", "Algebra", "Topology", "Number theory", "Geometry", "Logic", "Probability", "Combinatorics"] as const;
export type Subject = typeof subjects[number] | "Other";
export const subjectClass = (subject: Subject) => "v7-subject-" + (subjects.indexOf(subject as typeof subjects[number]) + 1);
const glyphs: Record<Subject, string> = {
  Analysis: "M2 10C5 2 7 2 10 10S15 18 18 10M2 6C7 6 7 14 12 14S16 6 18 6",
  Algebra: "M3 16L7 3M8 17L12 4M2 11L17 14",
  Topology: "M10 3C1 3 1 17 10 17S19 3 10 3ZM4 6C16 0 16 20 4 14",
  "Number theory": "M10 2A8 8 0 1 0 10 18A8 8 0 1 0 10 2ZM3 13L16 6M4 5L15 16",
  Geometry: "M3 15L10 3L17 15ZM3 15A8 8 0 0 1 17 15M3 15A8 8 0 0 0 17 15",
  Logic: "M10 2L3 7V13L10 18L17 13V7ZM3 7L10 11L17 7M10 11V18",
  Probability: "M2 16C6 16 6 4 10 4S14 16 18 16M3 18H17",
  Combinatorics: "M10 2L2 17H18ZM6 10H14M6 10L10 17L14 10",
  Other: "M10 10C-2 0 22 0 10 10C20-2 20 22 10 10C22 20-2 20 10 10C0 22 0-2 10 10",
};
export function SubjectMark({ subject, size = "glyph", seed = subject, broken = false }: { subject: Subject; size?: "glyph" | "tile" | "hero"; seed?: string; broken?: boolean }) {
  return <span className={`v7-subject-mark ${subjectClass(subject)} v7-mark-${size}`} aria-hidden="true">
    {size === "glyph" ? <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={glyphs[subject]} /></svg> :
      <Emblem subject={subject} seed={seed} size={size === "tile" ? 48 : 164} animate={false} broken={broken} />}
  </span>;
}
