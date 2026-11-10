import {MathPreview} from '../../ui/MathPreview';
import { useState } from "react";
import { useProject, useProjects } from "../../data/hooks";
import type { CardDetail, NoteKind, NoteType } from "../../data/types";
import { Button } from "../../ui/Button";
import { MathText } from "../../ui/MathText";
import { isFlagOn } from "../../flags";
import { cardTypeText, noteKindText } from "../../lib/labels";
export interface EditorValue {
  front: string;
  back: string;
  type: NoteType;
  kind: NoteKind;
  projectSlug: string;
  checkpointCode?: string;
  tags: string[];
}
const types: NoteType[] = ["basic", "cloze", "reverse"];
const kinds: NoteKind[] = [
  "definition",
  "theorem",
  "why",
  "example",
  "counterexample",
  "proof",
  "other",
];
const field =
  "mt-2 min-h-12 w-full rounded-ctl border border-edge bg-well p-3 text-ink";
function Checkpoints({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const q = useProject(slug);
  return (
    <label>
      Checkpoint
      <select
        className={field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">No checkpoint</option>
        {q.data?.checkpoints
          .filter((c) => c.ui !== "proposed")
          .map((c) => (
            <option key={c.id} value={c.code}>
              {c.code} · {c.title}
            </option>
          ))}
      </select>
    </label>
  );
}
export function Editor({
  initial,
  creating,
  busy,
  onSubmit,
  formId,
}: {
  initial?: CardDetail["note"];
  creating?: boolean;
  busy: boolean;
  onSubmit: (value: EditorValue) => void;
  /** N121 (v6): the parent sheet renders the submit button in its fixed footer with form={formId}. */
  formId?: string;
}) {
  const v6 = isFlagOn("v6Shell");
  const projects = useProjects(),
    [front, setFront] = useState(initial?.front ?? ""),
    [back, setBack] = useState(initial?.back ?? ""),
    [type, setType] = useState<NoteType>(initial?.type ?? "basic"),
    [kind, setKind] = useState<NoteKind>(initial?.kind ?? "other"),
    [project, setProject] = useState(initial?.projectSlug ?? ""),
    [checkpoint, setCheckpoint] = useState(initial?.checkpointCode ?? ""),
    [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  return (
    <form
      id={formId}
      className="flex flex-col gap-4 text-body text-ink-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          front,
          back,
          type,
          kind,
          projectSlug: project,
          checkpointCode: checkpoint || undefined,
          tags: tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        });
      }}
    >
      <label>
        Front
        <textarea
          required
          value={front}
          onChange={(e) => setFront(e.target.value)}
          className={`${field} min-h-24`}
        />
      </label>
      {front.length>300&&<p role="status" className="text-label text-amber">Long front ({front.length} characters). Consider splitting this into one idea per card.</p>}
      {!v6&&<MathPreview source={front}/>}
      <label>
        Back
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          className={`${field} min-h-24`}
        />
      </label>
      {back.length>1200&&<p role="status" className="text-label text-amber">Long back ({back.length} characters). Consider splitting the explanation into smaller cards.</p>}
      {!v6&&<MathPreview source={back}/>}
      <div className={v6?"grid grid-cols-1 gap-3 sm:grid-cols-2":"grid grid-cols-2 gap-3"}>
        <label>
          {v6?"Card type":"Type"}
          <select
            className={field}
            value={type}
            onChange={(e) => setType(e.target.value as NoteType)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {v6?cardTypeText(t):t}
              </option>
            ))}
          </select>
        </label>
        <label>
          {v6?"Note type":"Kind"}
          <select
            className={field}
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {v6?noteKindText(k):k}
              </option>
            ))}
          </select>
        </label>
      </div>
      {creating ? (
        <>
          <label>
            {v6?"Path":"Project"}
            <select
              required
              className={field}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setCheckpoint("");
              }}
            >
              <option value="">{v6?"Choose a path":"Choose a project"}</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {project && (
            <Checkpoints
              slug={project}
              value={checkpoint}
              onChange={setCheckpoint}
            />
          )}
        </>
      ) : (
        <label>
          Tags, separated by commas
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={field}
          />
        </label>
      )}
      <div>
        <p className="mb-3 text-label font-semibold uppercase text-ink-3">
          Preview
        </p>
        <MathText
          source={front || "Your question"}
          variant="card"
          cloze={type === "cloze" ? { ord: 1, revealed: false } : undefined}
        />
        {back && <MathText source={back} variant="answer" />}
      </div>
      {!formId&&<Button
        type="submit"
        disabled={busy || !front.trim() || (!!creating && !project)}
      >
        {creating ? "Create card" : "Save changes"}
      </Button>}
    </form>
  );
}
