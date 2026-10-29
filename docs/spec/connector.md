# Connector specification (Claude and ChatGPT)

The connector is an MCP server that lets Claude and ChatGPT read and write the owner's study data. It runs as one Supabase Edge Function named `mcp`. It is built in task MCP-1 (`plan.md`).

## 1. Goals and budgets

- **Cheap to resume.** One call (`resume`) returns everything needed to continue, in compact text. Target ≤ 1,400 characters (about 350 tokens); hard cap 2,400.
- **Cheap to carry.** Tool definitions are sent with every chat turn, so the full `tools/list` response must stay ≤ 9,000 characters. Keep descriptions exactly as written in §5.
- **Deep on demand.** Plan, checkpoint, outline, pages and search are separate read tools the chatbot calls only when needed.
- **Safe writes.** Progress and session records are written directly. Curriculum (cards, plans, card fixes) becomes a proposal that the owner approves in the app, except cards the owner dictated (`direct`).
- **No raw SQL.** The chatbot never sees table names or writes queries.

Output budgets per call: `resume` 2,400 chars; `get` 2,000; `read_pages` 12,000 (≤ 5 pages); `search` 1,500; every write tool ≤ 160.

## 2. Endpoint and auth

- URL shape: `https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/mcp/<secret>` where `<secret>` is `settings.connector_secret` (48 hex chars). The owner copies the full URL from Lemma › Settings.
- Both Claude ("No sign in") and ChatGPT ("No authentication") accept a plain URL. The secret in the path is the only credential. Rotating it in Settings invalidates the old URL.
- `supabase/config.toml` must contain `[functions.mcp]` with `verify_jwt = false` (the gateway would otherwise reject MCP clients).
- On each request: take the first path segment after `/mcp/`; look up `settings.user_id` by `connector_secret` (cache for 60 s per instance); unknown secret → HTTP 404 with no body detail. Compare secrets with a constant-time comparison.
- Database access uses the secret key: `JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS'))['default']`, falling back to `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses RLS, so **every query filters by the resolved `user_id`** (see `data.md` §1).
- Each successful tool call updates `settings.connector_last_seen_at = now()` and `connector_last_client` (from the session's client or the last `start_session` value).
- Answer `OPTIONS` with 204 and permissive CORS headers so the MCP Inspector works from a browser.

## 3. Server structure (all under `supabase/functions/mcp/`)

| File | Contents |
| --- | --- |
| `index.ts` | `Deno.serve`; path parsing; auth; routes `/mcp/<secret>` (MCP) and `/mcp/<secret>/selftest` (§9) |
| `server.ts` | builds the MCP server per request with `createMcpHandler` and registers the 11 tools; sets server instructions (§4) |
| `deps.ts` | imports pinned as in Supabase's guide: `npm:@modelcontextprotocol/server@^2.0.0`, `npm:zod@^4.3.6`, `npm:@supabase/supabase-js@2` |
| `db.ts` | Supabase client with the secret key; small typed helpers; every helper takes `userId` |
| `resolve.ts` | resolve project (slug, then case-insensitive title, then unique prefix), checkpoint code, session number, source short name; helpful error text listing valid options |
| `derive.ts` | checkpoint UI status, session display state, re-check ladder, due counts — same rules as `data.md` §6 (copy the logic of `src/lib/derive.ts`; keep both in sync) |
| `packet.ts` | builds the resume packet (§8) and enforces its budget |
| `text.ts` | truncation helpers (cut at word boundary, append `…`), date formatting (`28 Oct`), page range parsing |
| `rules.ts` | default tutor rules (§6), planning rules (§6.2), style presets (§7), card-writing rules |
| `tools/*.ts` | one file per tool in §5 |
| `selftest.ts` | §9 |

Implementation rules:
- Tool results are plain text (`content: [{type: 'text', text}]`), never JSON dumps.
- Validation errors and "not found" return `isError: true` with one actionable sentence, e.g. `No project "analysis". Projects: real-analysis, linear-algebra, topology.`
- Read tools carry `annotations: {readOnlyHint: true}`. Write tools carry `annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: false}`. ChatGPT asks the user to confirm every tool without `readOnlyHint`, so writes are few and batched.
- No tool deletes data.
- Use codes in output (`CP4`, `S8`, `N123`, `#12`), never UUIDs.

## 4. Server instructions (sent at initialize; exact text, ≤ 512 chars)

```
Lemma is the user's math study record. When they say study, resume, continue or plan <project>, call resume first and follow the RULES it returns. Save progress with save_progress at each step and every ~6 messages so a cut-off chat loses nothing. Cards, plans and card fixes are proposals the user approves in the Lemma app. Read the book with read_pages instead of guessing. Do not show tool output verbatim to the user.
```

## 5. Tools

Descriptions below are exact. Parameter descriptions are the text after the colon; keep them that short.

### 5.1 `resume` (read)
Description: `Start here when the user wants to study, resume, continue or plan. Returns where they stopped, warm-up, rules and style. Omit project to list projects.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string, optional, ≤ 60 | `Project slug or title` |
| `mix` | boolean, optional | `Interleave all active projects` |
| `brief` | boolean, optional | `Skip RULES if already received in this chat` |

Behavior:
- No `project` and not `mix`: return the project menu (§8.3).
- Project in `planning` status: return the planning packet (§8.4).
- Otherwise: the study packet (§8.1). `mix` returns the mixed packet (§8.5).
- Never writes.

### 5.2 `get` (read)
Description: `Read details on demand. what: plan, checkpoint (id CP4), session (id S7), outline, cards (id CP4 or S7), feedback (open card notes), concepts, projects.`

| Param | Type | Description |
| --- | --- | --- |
| `what` | enum `plan`, `checkpoint`, `session`, `outline`, `cards`, `feedback`, `concepts`, `projects` | `What to read` |
| `project` | string, optional | `Project slug or title` |
| `id` | string, optional, ≤ 20 | `CP4, S7 or source short name` |
| `limit` | int 1–50, optional | `Max items` |

Outputs (≤ 2,000 chars; truncate with `+N more`):
- `plan`: header `PLAN real-analysis 3/12 done` then one line per checkpoint in order: `CP4 now step 2/4 Compactness`, `CP2 revisit Open and closed sets`, `CP5 next Continuity (needs CP4, CP4a)`, `CP6 locked Limits of functions`, `CP4a proposed Finite subcover lemma`.
- `checkpoint`: `CP4 Compactness [now, step 2/4]`, `OBJ …`, `CRIT …`, `STEPS 1 Set up the cover ✓ | 2 Separate x from K ← | 3 … | 4 …`, `PAGES rudin 36-40`, `NEEDS CP2, CP3`, `IDEAS compactness, open-cover`, `RECHECK due 30 Oct: <prompt>`, then up to 8 latest events `S8 hint L1: Use Hausdorff to make them disjoint`.
- `session`: `S7 ended 28 Oct 42m goal yes`, `GOAL …`, `SUMMARY …`, then up to 15 events in order.
- `outline`: one line per outline entry `p.36 (pdf 48) 2.31 Compact sets` indented by level with two spaces; max 80 lines.
- `cards`: fronts only, plain text without LaTeX delimiters, ≤ 30: `N12 State the Heine–Borel theorem.` Use before proposing cards to avoid duplicates.
- `feedback`: open comments, oldest first, ≤ 10: `#12 on N7 (2 h ago): Too wordy. Make the hypotheses a cloze.` then `  FRONT …` and `  BACK …` of that card.
- `concepts`: `name — status` for the project's subject, ≤ 60.
- `projects`: same as the menu (§8.3).

### 5.3 `read_pages` (read)
Description: `Read the project's PDF by printed page numbers (pdf: true for PDF indexes). Max 5 pages per call.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string, optional | `Project slug or title` |
| `source` | string, optional | `Source short name; default first` |
| `from` | string, ≤ 12 | `First page, e.g. 36 or xiv` |
| `to` | string, optional | `Last page; max 5 pages` |
| `pdf` | boolean, optional | `Treat from/to as PDF page indexes` |

Output: for each page `=== p.36 (pdf 48) ===` then the page text. Cap 12,000 chars total; if a page is cut, end with `[cut, call again from p.37]`. If the source has no text: `This PDF has no extractable text (scanned). Ask the user to paste the passage.`

### 5.4 `search` (read)
Description: `Full-text search in the project's PDFs. Returns pages with short snippets.`

| Param | Type | Description |
| --- | --- | --- |
| `query` | string 2–120 | `Words to find` |
| `project` | string, optional | `Project slug or title` |
| `limit` | int 1–8, optional | `Max hits, default 5` |

Uses `websearch_to_tsquery('english', query)` ranked by `ts_rank`, snippet via `ts_headline` (MaxWords 24, MinWords 8, markers `«` `»`). Output lines: `rudin p.38 (pdf 50): …a «finite subcover» of K…`.

### 5.5 `start_session` (write)
Description: `Open a study session before teaching. Returns its code. Reuses an open session on the same checkpoint from the last 3 hours.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `goal` | string 1–200 | `What this session should achieve` |
| `checkpoint` | string, optional | `CP code; default the current one` |
| `style` | string, optional | `Style key; default project style` |
| `client` | enum `claude`, `chatgpt`, `other` | `Which assistant you are` |

Behavior: if an open session for this project and checkpoint had activity in the last 3 hours, return it (`continuing S8`). Otherwise close other open sessions of the project as `ended` with `goal_met = null` and `summary = 'Interrupted'` only if they are older than 3 hours, then insert a session with `number = projects.next_session_number` (increment it), set the checkpoint's status to `in_progress` if it was `not_started`, and its `current_step` to 1 if 0. Output: `started S9 on CP4 (step 2/4)`.

### 5.6 `save_progress` (write)
Description: `Save in one call: step, events, misconception and the next question. Call at each step change and every ~6 messages.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `session` | string | `Session code, e.g. S8` |
| `step` | int 1–8, optional | `Current checkpoint step` |
| `events` | array ≤ 10, optional | `What happened, in order` |
| `events[].kind` | enum `pretest`, `attempt`, `hint`, `explanation`, `evidence`, `recheck`, `note` | |
| `events[].text` | string 1–600 | |
| `events[].outcome` | enum `demonstrated`, `partial`, `failed`, optional | `For attempt, evidence, recheck` |
| `events[].hint_level` | int 1–4, optional | `For hint` |
| `events[].checkpoint` | string, optional | `If not the session's checkpoint` |
| `misconception` | string ≤ 120, optional | `Short label of a new or repeated error` |
| `resolved` | string ≤ 120, optional | `Label of a misconception now fixed` |
| `next_question` | string ≤ 300, optional | `The question to ask when resuming` |

Behavior (one transaction):
1. Insert events. `misconception` also inserts an event of kind `misconception` and upserts `misconceptions` (times + 1, `last_seen_at`).
2. `resolved` sets `resolved_at` on the matching misconception (case-insensitive label match).
3. `step` sets `checkpoints.current_step` and `sessions.resume_step`.
4. An `evidence` event with outcome `demonstrated` marks its checkpoint demonstrated now (status, `demonstrated_at`, `current_step = len(steps)`, re-check ladder start, clear `needs_revisit`).
5. A `recheck` event applies the re-check ladder (`data.md` §6.3) to its checkpoint.
6. Update `sessions.resume_question` (when given) and `last_activity_at`.
Output: `saved S8: step 2, 3 events`.

### 5.7 `end_session` (write)
Description: `Close the session with a short summary and whether its goal was met.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `session` | string | `Session code` |
| `summary` | string 1–600 | `2–3 lines: what was learned, what is next` |
| `goal_met` | enum `yes`, `partial`, `no` | `Was the goal met?` |
| `recheck_prompt` | string ≤ 300, optional | `A retrieval question for this checkpoint` |

Output: `closed S8 (38 min). 3 proposals wait in Lemma.`

### 5.8 `propose_cards` (write)
Description: `Propose up to 8 cards; the user approves them in Lemma. One idea per card, question on front, LaTeX in $...$, cloze as {{c1::...}}. direct only if the user dictated the card.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `session` | string, optional | `Session code` |
| `cards` | array 1–8 | |
| `cards[].front` | string 1–1500 | |
| `cards[].back` | string ≤ 3000, optional | `Empty for cloze` |
| `cards[].type` | enum `basic`, `cloze`, `reverse`, optional | |
| `cards[].kind` | enum `definition`, `theorem`, `why`, `example`, `counterexample`, `proof`, `other`, optional | |
| `cards[].checkpoint` | string, optional | `CP code` |
| `cards[].concept` | string ≤ 60, optional | `Idea name for the Atlas` |
| `cards[].page` | string ≤ 12, optional | `Printed page` |
| `cards[].reason` | string ≤ 200, optional | `Why this card, shown to the user` |
| `direct` | boolean, optional | `User dictated these; add without approval` |

Behavior: reject a card whose normalized front (lowercase, whitespace collapsed, LaTeX delimiters removed) equals an existing active note's front in the project (`skipped 1 duplicate`). Insert one `proposals` row per card (`kind = 'card'`, origin = the session's client or `other`). With `direct`, insert the proposal and immediately call `approve_proposal` (it uses the proposal's `user_id`, see `data.md` §5.4). Output: `4 cards wait for approval in Lemma` or `2 cards added`.

### 5.9 `propose_card_edits` (write)
Description: `Propose fixes to existing cards, e.g. answering card notes from get feedback. The user approves in Lemma.`

| Param | Type | Description |
| --- | --- | --- |
| `edits` | array 1–10 | |
| `edits[].card` | string | `Note code, e.g. N7` |
| `edits[].front` | string, optional | |
| `edits[].back` | string, optional | |
| `edits[].type` | enum, optional | |
| `edits[].resolves` | int[], optional | `Comment numbers this fixes` |
| `edits[].reason` | string ≤ 200 | `What changed and why` |

Output: `2 card fixes wait for approval`.

### 5.10 `propose_plan` (write)
Description: `Propose the first plan for a project in planning: ordered checkpoints with observable criteria, steps, pages, prerequisites and concepts. The user approves in Lemma.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `checkpoints` | array 3–40 | `In study order` |
| `checkpoints[].title` | string ≤ 80 | |
| `checkpoints[].objective` | string ≤ 400 | `What the student will be able to do` |
| `checkpoints[].criterion` | string ≤ 400 | `Observable evidence, never reading` |
| `checkpoints[].steps` | string[] 1–8 | `Short step titles` |
| `checkpoints[].pages` | string, optional | `Printed range, e.g. 36-40` |
| `checkpoints[].prereqs` | int[], optional | `Indexes (1-based) of earlier checkpoints` |
| `checkpoints[].concepts` | string[] ≤ 4, optional | `Idea names` |
| `checkpoints[].recheck_prompt` | string ≤ 300, optional | `Retrieval question` |
| `concepts` | array ≤ 80, optional | `{name, blurb, prereqs: names, related: names}` |
| `reason` | string ≤ 300, optional | |

Validation: prerequisites must point to earlier checkpoints (no cycles); a criterion starting with "Read" or "Review" is rejected (`Criterion must be work the student produces`). Converts indexes to `CP` codes. Output: `plan with 12 checkpoints waits for approval in Lemma`.

### 5.11 `propose_plan_change` (write)
Description: `Propose changes to an approved plan: add, update, remove, move, prereq_add, prereq_remove. Keep unaffected checkpoints. The user approves in Lemma.`

| Param | Type | Description |
| --- | --- | --- |
| `project` | string | `Project slug or title` |
| `ops` | array 1–20 | `Operations as in the plan change format` |
| `reason` | string 1–300 | `Why the plan should change` |

Op fields follow `data.md` §5.4. Output: `plan change (2 ops) waits for approval`.

## 6. Tutor rules

### 6.1 Default study rules (used when `settings.tutor_rules` is null)

```
- Ask WARM questions first, no hints; log each with save_progress (kind recheck, outcome).
- At a new checkpoint ask 1 pretest question before teaching (kind pretest).
- Teach in STYLE. One idea at a time; check with a question before moving on.
- Hint ladder: 1 nudge question, 2 key idea, 3 one step, 4 worked step. Never give a full proof or solution before the student's own attempt. Log hints with level.
- Ask the student to explain key steps in their own words (kind explanation).
- Quote or cite the book only after read_pages; cite as (p. 37).
- Log a misconception as soon as you see one (short label).
- save_progress at every step change and at least every 6 messages, with next_question.
- When an idea clicks or an error is fixed, propose 1-3 atomic cards.
- Mark demonstrated only when CRIT is met by the student's unaided work (kind evidence, outcome demonstrated, one-line description).
- Before ending: 3 quick recall questions on today's ideas, then end_session.
```

### 6.2 Planning rules (packet for projects in `planning`)

```
- Read get(what=outline) and the key pages with read_pages; do not copy the book.
- Ask the user at most 3 short questions (level, time per week, focus).
- Then call propose_plan with 8-20 checkpoints in dependency order. Each needs an objective, an observable criterion (a proof, computation or explanation the student produces), 2-6 steps, printed pages, prerequisites, 1-3 concepts and a recheck_prompt.
- Add early checkpoints for missing prerequisites the goal reveals.
- Tell the user to approve the plan in Lemma, then resume.
```

### 6.3 Mixed-session rules (appended when `mix`)

```
- Interleave: switch project after each checkpoint step; start_session for each project you touch and save to the right session.
```

## 7. Teaching style presets (seeded by `bootstrap()`)

| key | name | icon | instructions |
| --- | --- | --- | --- |
| `socratic` | Socratic | `circle-help` | Lead with questions. Reveal one idea at a time. Let the student do the reasoning and respond to their attempt before adding anything. |
| `examples` | Examples first | `list` | Show one fully worked example, then a similar problem with steps faded, then one unaided. Fade support as accuracy rises. |
| `proof_lab` | Proof workshop | `pencil-line` | The student drafts proofs; critique line by line. Name the gap and ask for the fix; never rewrite the proof for them. |
| `quiz` | Quick quiz | `zap` | Rapid retrieval: short questions mixed from this and earlier checkpoints, immediate feedback, one-line explanations. |
| `visual` | Visual | `eye` | Build intuition first with pictures in words, concrete examples and counterexamples, then formalize. |
| `lecture` | Short lecture | `book-open` | Explain the idea in at most 150 words with one example, then check understanding with one question before moving on. |

The owner can edit names and instructions in Settings (≤ 500 chars).

## 8. Resume packet format

Plain text. One field per line, uppercase tag, single space, value. Omit a line when it has no value. Dates as `28 Oct`. No Markdown.

### 8.1 Study packet

```
LEMMA <title> [<slug>] style <style key>
GOAL <project goal, cut to 160 chars>
NOW <code> <title>, step <n>/<total>: <step title>
CRIT <criterion>
LAST S<n> <date> <live|paused|ended>[ goal <yes|partial|no>]: <summary cut to 160> | ask: <resume_question>
FIX <label> (<times>x); <label> (<times>x)
WARM <code>: <recheck_prompt>; <code>: <recheck_prompt>
CARDS <due> due; <pending> proposals waiting; <open comments> card notes
SRC <short> "<source title cut to 40>" pp <pages>: read_pages(source="<short>", from="<a>", to="<b>")
STYLE <style name>: <instructions>
RULES
<rules from §6.1, or settings.tutor_rules>
```

Field rules:
- `NOW`: the checkpoint of the newest open session; else the first checkpoint with UI status `now`; else the first `next`. If none: `NOW all checkpoints done`.
- `LAST`: newest session of the project. Use `paused` when open and idle for over 30 minutes. The text after the colon is `summary` for an ended session and `resume_note` for an open one (omit the colon part when empty). Include `| ask:` only when `resume_question` is set and the session is not ended.
- `FIX`: up to 3 unresolved misconceptions, newest first.
- `WARM`: up to 2 checkpoints of this project with UI status `revisit` and a `recheck_prompt`, oldest due first.
- `SRC`: the NOW checkpoint's pages and source; skip if unknown.
- `brief: true` removes `STYLE` and `RULES`.
- Budget: if the packet exceeds 2,400 chars, shorten in this order: `LAST` summary, `FIX`, `WARM`, `GOAL`.

### 8.2 Example (demo data, about 1,100 characters)

```
LEMMA Real Analysis [real-analysis] style socratic
GOAL Prove the main theorems of Rudin ch. 2–4. Comfortable with ε–δ, shaky on topology arguments.
NOW CP4 Compactness, step 2/4: Separate x from K
CRIT Writes, unaided, a proof that compact sets in a Hausdorff space are closed.
LAST S8 29 Oct paused: Set up U_y, V_y for each y | ask: Why is a finite subcover enough to separate x from K?
FIX open cover vs open set (2x)
WARM CP2: What makes a set open in a metric space?
CARDS 23 due; 6 proposals waiting; 1 card notes
SRC rudin "Principles of Mathematical Analysis" pp 36-40: read_pages(source="rudin", from="36", to="40")
STYLE Socratic: Lead with questions. Reveal one idea at a time. Let the student do the reasoning and respond to their attempt before adding anything.
RULES
- Ask WARM questions first, no hints; ...
```

### 8.3 Project menu (no project given)

```
LEMMA projects. Ask which one, or resume with mix=true.
real-analysis  Real Analysis: CP4 Compactness, paused 2 h ago
linear-algebra Linear Algebra: CP9 Diagonalization
topology       Topology: CP2 Topological spaces
CARDS 23 due; 6 proposals waiting
```
A project in planning is listed as `<slug> <title>: needs plan`.

### 8.4 Planning packet

```
LEMMA <title> [<slug>] PLANNING
GOAL <full goal, cut to 1,000 chars>
SRC <short> "<title>" <pages> pages, outline <n> entries: get(what=outline)
STYLE <style name>
RULES
<planning rules §6.2>
```

### 8.5 Mixed packet (`mix: true`)

```
LEMMA mix: real-analysis, linear-algebra, topology
NOW real-analysis CP4 Compactness step 2/4 | linear-algebra CP9 Diagonalization step 1/3 | topology CP2 Topological spaces step 1/4
WARM real-analysis CP2: …; linear-algebra CP6: …
CARDS 23 due; 6 proposals waiting
RULES
<§6.1 + §6.3>
```

## 9. Self-test

`GET /functions/v1/mcp/<secret>/selftest` runs, as the owner, a scripted sequence on throwaway data and returns JSON `{ok, steps: [{name, ok, ms, detail}]}`. It must clean up even when a step fails (delete the temporary project and subject by id in a `finally`).

Steps:
1. Create subject `zz-selftest` and project `zz-selftest-<timestamp>` (status planning) with one source whose two pages contain the text "finite subcover".
2. `resume(project)` contains `PLANNING`.
3. `propose_plan` with 3 checkpoints → one pending proposal; approve it through RPC `approve_proposal`; project becomes active.
4. `resume` contains `NOW CP1` and `RULES`; length ≤ 2,400.
5. `start_session` → `started S1`; second call → `continuing S1`.
6. `save_progress` with step 2, a hint event and a misconception → `get(what=checkpoint, id=CP1)` shows the hint; `resume` shows `FIX`.
7. `search("finite subcover")` returns a hit; `read_pages(from="1", pdf=true)` returns page text.
8. `propose_cards` with 2 cards → 2 pending proposals; `direct: true` with 1 card → 1 note exists.
9. `end_session` → session ended with minutes set.
10. `tools/list` (built in-process) total JSON ≤ 9,000 chars.

`tests/mcp/smoke.mjs` (Node 22, no dependencies) reads `MCP_URL` from the environment and:
1. Calls `MCP_URL + '/selftest'` and fails if `ok` is false.
2. Sends JSON-RPC `initialize`, then `tools/list` to `MCP_URL` with header `Accept: application/json, text/event-stream`; checks 11 tools with the names in §5 and the size limit.
3. Prints one line per step and exits non-zero on failure.

## 10. Owner setup (shown in Lemma › Settings and in `docs/guide.md`)

**Claude** (web or desktop once; then it works on the phone too):
1. Customize › Connectors › Add › Add custom connector.
2. Name `Lemma`, URL = the address from Lemma › Settings, Authentication: No sign in. Add.
3. In a chat, make sure Lemma is on (+ › Connectors). Choose "Allow always" for Lemma's tools when asked.

**ChatGPT** (Plus; developer mode works on the web):
1. Settings › Apps › Advanced settings › turn on Developer mode.
2. Create app: name `Lemma`, MCP server URL = the address from Lemma › Settings, Authentication: No authentication. Create.
3. In a new chat: + › Developer mode › select Lemma. When asked to confirm a write, choose to remember for this conversation.

**Optional instruction** (Claude project instructions or ChatGPT custom instructions):
`When I say study, resume or plan <name>, use the Lemma connector: call resume first and follow its rules.`

Limits to tell the owner: ChatGPT's developer mode is web-only; each ChatGPT chat needs Lemma enabled from the + menu; Claude connectors added on the web also work in the Claude phone app.
