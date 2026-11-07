# docs/current — one note per finished item

From CI v2.6 (2026-11-07), each PR records what it built or fixed in its own new file here, instead of adding a section to `CURRENT.md`:

- `docs/current/N52.md` for an item, `docs/current/bug-1109.md` for a bug, `docs/current/incident-1016.md` for an incident.
- Start the file with a `## ` heading, as the CURRENT.md sections did.
- `CURRENT.md` stays the overview: what Lemma is, the stack, and every note written before v2.6. Edit an existing section there only to correct it.

Read `CURRENT.md` and these notes together for what exists. Why: every PR appending to the end of `CURRENT.md` made every other open PR conflict, so CI merged main into them and re-ran their checks. That was about half of all PR gate runs.
