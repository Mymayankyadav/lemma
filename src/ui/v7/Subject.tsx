import { Emblem } from "./Emblem";
export const subjects = ["Analysis", "Algebra", "Topology", "Number theory", "Geometry", "Logic", "Probability", "Combinatorics"] as const;
export type Subject = typeof subjects[number] | "Other";
export const subjectClass = (subject: Subject) => "v7-subject-" + (subjects.indexOf(subject as typeof subjects[number]) + 1);
export function SubjectMark({ subject, size = "glyph", seed = subject, broken = false }: { subject: Subject; size?: "glyph" | "tile" | "hero"; seed?: string; broken?: boolean }) {
  return <span className={`v7-subject-mark ${subjectClass(subject)} v7-mark-${size}`} aria-hidden="true">
    {/* Emblem v2: the glyph tier is the family's 1–3 stroke silhouette, from the same generator as tiles and heroes. */}
    <Emblem subject={subject} seed={seed} size={size === "glyph" ? 20 : size === "tile" ? 48 : 164} tier={size} animate={false} broken={broken} />
  </span>;
}
/** KC2: the subject glyph for a `.v7-subject-N` class (week strip, month cells, week blocks, legends) — never a bare dot. */
export function subjectFromClass(klass: string): Subject {
  const index = Number(/v7-subject-(\d+)/.exec(klass)?.[1] ?? 0);
  return index >= 1 && index <= subjects.length ? subjects[index - 1] : "Other";
}
export function SubjectGlyph({ klass }: { klass: string }) {
  return <SubjectMark subject={subjectFromClass(klass)} />;
}
