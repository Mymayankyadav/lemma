import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Search } from "lucide-react";
import { useCreateNote, useProjects, useSearchCards } from "../../data/hooks";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { IconButton } from "../../ui/IconButton";
import { Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/Toast";
import { Editor, type EditorValue } from "./Editor";
import { Tex } from "../../ui/Tex";
function relative(due: string | null) {
  if (!due) return "New";
  const days = Math.ceil((Date.parse(due) - Date.now()) / 86400000);
  return days <= 0 ? "Due" : days === 1 ? "in 1d" : `in ${days}d`;
}
export default function Page() {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [creating, setCreating] = useState(false),
    [slow, setSlow] = useState(false);
  const cards = useSearchCards(query),
    projects = useProjects(),
    create = useCreateNote(),
    notify = useToast(),
    navigate = useNavigate();
  const closeCreating = useCallback(() => setCreating(false), []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!cards.isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [cards.isLoading]);
  useEffect(() => {
    if (cards.isError)
      notify("Couldn't load cards.", {
        tone: "danger",
        action: { label: "Try again", onClick: () => void cards.refetch() },
      });
  }, [cards.isError]);
  const rows = (cards.data ?? []).filter(
    (c) =>
      c.status !== "deleted" &&
      (filter === "all" ||
        (filter === "notes"
          ? c.openComments > 0
          : filter === "paused"
            ? c.status === "suspended"
            : c.projectSlug === filter)),
  );
  const save = async (v: EditorValue) => {
    try {
      const result = await create.mutateAsync({
        front: v.front,
        back: v.back,
        type: v.type,
        kind: v.kind,
        projectSlug: v.projectSlug,
        checkpointCode: v.checkpointCode,
      });
      setCreating(false);
      notify("Card created");
      void navigate(`/cards/${result.noteNo}`);
    } catch {
      notify("Couldn't create the card.", { tone: "danger" });
    }
  };
  return (
    <Screen
      title="Cards"
      back="/"
      actions={
        <IconButton
          icon={Plus}
          label="New card"
          tone="amber"
          onClick={() => setCreating(true)}
        />
      }
    >
      <label className="flex min-h-[var(--row)] items-center gap-3 rounded-ctl border border-edge bg-well px-4 text-ink-3">
        <Search size={19} />
        <span className="sr-only">Search cards</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <div
        className="flex w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1"
        role="group"
        aria-label="Card filters"
      >
        <Chip className="shrink-0 whitespace-nowrap" selected={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        {projects.data?.map((p) => (
          <Chip
            key={p.id}
            className="shrink-0 whitespace-nowrap"
            selected={filter === p.slug}
            onClick={() => setFilter(p.slug)}
          >
            <span aria-hidden="true" className="shrink-0">{p.subject.glyph}</span>
            <span className="whitespace-nowrap"><Tex source={p.title} /></span>
          </Chip>
        ))}
        <Chip className="shrink-0 whitespace-nowrap" selected={filter === "notes"} onClick={() => setFilter("notes")}>
          Has notes
        </Chip>
        <Chip
          className="shrink-0 whitespace-nowrap"
          selected={filter === "paused"}
          onClick={() => setFilter("paused")}
        >
          Paused
        </Chip>
      </div>
      {cards.isLoading ? (
        slow ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} w="100%" h={64} />
            ))}
          </div>
        ) : null
      ) : cards.isError ? (
        <Button variant="ghost" onClick={() => void cards.refetch()}>
          Try again
        </Button>
      ) : rows.length ? (
        <div className="flex flex-col">
          {rows.map((row) => (
            <Link
              key={row.noteNo}
              to={`/cards/${row.noteNo}`}
              className="flex min-h-16 items-center gap-3 border-b border-edge py-3 focus-visible:outline-2 focus-visible:outline-amber"
            >
              <span aria-hidden="true" className="w-6 shrink-0 text-center font-math text-card italic text-amber">{row.glyph}</span>
              <span className="min-w-0 flex-1">
                <span data-card-front=""
                  className={`min-w-0 max-w-full font-math text-headline leading-snug text-ink ${row.front.includes('
                <span className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3">
                  <span className="inline-flex w-[46px] shrink-0 justify-center rounded-[3px] border border-edge px-1 py-0.5 tabular-nums">{row.checkpointCode ?? "—"}</span>
                  <span>{row.status === "suspended" ? "Paused" : relative(row.due)}</span>
                  {row.openComments > 0 && <span className="text-amber">{row.openComments} tutor {row.openComments===1?"note":"notes"}</span>}
                </span>
              </span>
              {row.openComments > 0 && (
                <span
                  aria-label={`${row.openComments} open notes`}
                  className="h-7 w-[2px] shrink-0 bg-amber"
                />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <h2 className="text-card font-semibold">No cards match</h2>
          <Button
            variant="text"
            onClick={() => {
              setSearch("");
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <Sheet
        open={creating}
        onClose={closeCreating}
        title="New card"
      >
        <Editor
          creating
          busy={create.isPending}
          onSubmit={(v) => void save(v)}
        />
      </Sheet>
    </Screen>
  );
}
)?'block overflow-x-auto whitespace-nowrap':'line-clamp-2 overflow-hidden'}`}
                  style={row.front.includes('
                <span className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3">
                  <span className="inline-flex w-[46px] shrink-0 justify-center rounded-[3px] border border-edge px-1 py-0.5 tabular-nums">{row.checkpointCode ?? "—"}</span>
                  <span>{row.status === "suspended" ? "Paused" : relative(row.due)}</span>
                  {row.openComments > 0 && <span className="text-amber">{row.openComments} tutor {row.openComments===1?"note":"notes"}</span>}
                </span>
              </span>
              {row.openComments > 0 && (
                <span
                  aria-label={`${row.openComments} open notes`}
                  className="h-7 w-[2px] shrink-0 bg-amber"
                />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <h2 className="text-card font-semibold">No cards match</h2>
          <Button
            variant="text"
            onClick={() => {
              setSearch("");
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <Sheet
        open={creating}
        onClose={closeCreating}
        title="New card"
      >
        <Editor
          creating
          busy={create.isPending}
          onSubmit={(v) => void save(v)}
        />
      </Sheet>
    </Screen>
  );
}
)?{maskImage:'linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)'}:undefined}>
                  <span className={row.front.includes('
                <span className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3">
                  <span className="inline-flex w-[46px] shrink-0 justify-center rounded-[3px] border border-edge px-1 py-0.5 tabular-nums">{row.checkpointCode ?? "—"}</span>
                  <span>{row.status === "suspended" ? "Paused" : relative(row.due)}</span>
                  {row.openComments > 0 && <span className="text-amber">{row.openComments} tutor {row.openComments===1?"note":"notes"}</span>}
                </span>
              </span>
              {row.openComments > 0 && (
                <span
                  aria-label={`${row.openComments} open notes`}
                  className="h-7 w-[2px] shrink-0 bg-amber"
                />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <h2 className="text-card font-semibold">No cards match</h2>
          <Button
            variant="text"
            onClick={() => {
              setSearch("");
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <Sheet
        open={creating}
        onClose={closeCreating}
        title="New card"
      >
        <Editor
          creating
          busy={create.isPending}
          onSubmit={(v) => void save(v)}
        />
      </Sheet>
    </Screen>
  );
}
)?'inline-block min-w-max pr-4':undefined}><Tex source={row.front} /></span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3">
                  <span className="inline-flex w-[46px] shrink-0 justify-center rounded-[3px] border border-edge px-1 py-0.5 tabular-nums">{row.checkpointCode ?? "—"}</span>
                  <span>{row.status === "suspended" ? "Paused" : relative(row.due)}</span>
                  {row.openComments > 0 && <span className="text-amber">{row.openComments} tutor {row.openComments===1?"note":"notes"}</span>}
                </span>
              </span>
              {row.openComments > 0 && (
                <span
                  aria-label={`${row.openComments} open notes`}
                  className="h-7 w-[2px] shrink-0 bg-amber"
                />
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <h2 className="text-card font-semibold">No cards match</h2>
          <Button
            variant="text"
            onClick={() => {
              setSearch("");
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <Sheet
        open={creating}
        onClose={closeCreating}
        title="New card"
      >
        <Editor
          creating
          busy={create.isPending}
          onSubmit={(v) => void save(v)}
        />
      </Sheet>
    </Screen>
  );
}
