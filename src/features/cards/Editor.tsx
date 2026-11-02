import {MathPreview} from '../../ui/MathPreview';
import {networkWritable} from '../../ui/useOnlineStatus';
import { useState } from "react";
import { useProject, useProjects } from "../../data/hooks";
import type { CardDetail, NoteKind, NoteType } from "../../data/types";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/Toast";
import { MathText } from "../../ui/MathText";
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
}: {
  initial?: CardDetail["note"];
  creating?: boolean;
  busy: boolean;
  onSubmit: (value: EditorValue) => void;
}) {
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
      className="flex flex-col gap-4 text-body text-ink-2"
      onSubmit={(e) => {
        e.preventDefault();
        if(!networkWritable()){toast("Needs a connection");return}
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
      <MathPreview source={front}/>
      <label>
        Back
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          className={`${field} min-h-24`}
        />
      </label>
      {back.length>1200&&<p role="status" className="text-label text-amber">Long back ({back.length} characters). Consider splitting the explanation into smaller cards.</p>}
      <MathPreview source={back}/>
      <div className="grid grid-cols-2 gap-3">
        <label>
          Type
          <select
            className={field}
            value={type}
            onChange={(e) => setType(e.target.value as NoteType)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select
            className={field}
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      {creating ? (
        <>
          <label>
            Project
            <select
              required
              className={field}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setCheckpoint("");
              }}
            >
              <option value="">Choose a project</option>
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
      <Button
        type="submit"
        needsNetwork
        disabled={busy || !front.trim() || (!!creating && !project)}
      >
        {creating ? "Create card" : "Save changes"}
      </Button>
    </form>
  );
}
