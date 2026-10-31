# Tutor transcriptions: handwritten and scanned pages into text (owner, 31 Oct)

**Today.**
- The connector cannot push a PDF or any page text. `add` with kind `book` only creates an empty source record (`has_text: false`, no pages).
- Scanned PDFs uploaded in the app have no text layer, so `read_pages` and `search` cannot use them (see the scanned-PDF note in the OCR discussion of 30 Oct).

**Goal.** The tutor reads handwritten notes or scanned pages that the owner attaches in chat (photos or a PDF) and writes them into Lemma as text with Markdown and LaTeX. After that, `search`, `read_pages`, citations, cards and plans work on them like any other source.

## 1. Connector (MCP-6)

New tool `save_pages` (write, undoable, owner-scoped), taking `{project, source?, title?, kind?, pages: [{page, label?, text, confidence?}], replace?}`. `confidence` is `high` (the default when omitted) or `check`, which the tutor sets per page:
- **Into an existing source:** `source` names an uploaded scan (its short code). The tool fills `source_pages.body` for the given page numbers and sets `has_text` once at least one page has text. Existing text is kept unless `replace: true`.
- **As a new source:** no `source`, a `title` and an optional `kind` (default `notes`). The tool creates a text-only source with `origin` = the client and no stored file.
- **Limits per call:**
  - at most 10 pages per call;
  - at most 8,000 characters per page;
  - the text is Markdown with `$…$` and `$$…$$` LaTeX and is validated the same way as cards (no raw HTML).
  - Larger documents are sent in batches. The reply says "saved pages 11–20 of 'Lecture 7 notes'; next 21".
- **Provenance:**
  - every page stores `transcribed_by` (`claude` or `chatgpt`), `transcribed_at`, and `confidence` (`high` or `check`, chosen by the tutor);
  - illegible parts are written as `[illegible]`, never guessed;
  - every save is one action in the history, so `undo` removes it.
- **Rules (server instructions and the study packet):**
  - "When the student attaches handwritten or scanned pages, offer to transcribe them with `save_pages`."
  - "Transcribe exactly, including the student's mistakes; mark doubtful symbols with `confidence: check`."
  - "Then read them back with `read_pages` before citing."
- **Database (DB-5, a migration):**
  - `source_pages` gains `transcribed_by text null`, `transcribed_at timestamptz null` and `confidence text null check (confidence in ('high','check'))`;
  - `sources.origin` allows `claude` and `chatgpt`.
- **Self-test:** the self-test transcribes 2 pages into a fixture scan, one of them marked `confidence: check`. It finds them with `search`, reads them back, checks that the stored provenance (`transcribed_by`, `confidence`) is right, and undoes.

## 2. App (UI-8)

- **Sources tab:**
  - a scan shows "12 of 40 pages transcribed";
  - a text-only source shows "Transcribed by Claude";
  - pages marked `check` show a small amber dot.
- **Page viewer:**
  - shows the transcription rendered with LaTeX, with the original PDF page beside it (or above it on a phone) when a file exists;
  - **Edit** fixes a page in place (undoable);
  - **Mark checked** clears `check`.
- **Export:** "Download as .tex" and "Download as .md" for any transcribed source. One file per source, pages separated by `% page n`.
- **Tell your tutor:** on a scan with no text, the button copies "Transcribe my scanned notes '<title>' pages 1–10 into Lemma".

## 2b. Uploading .tex and .md files (UI-8b)

- The new-project and Sources pickers accept `.tex`, `.latex`, `.ltx` and `.md`/`.markdown`, alongside PDFs, with the same 50 MB limit. Other text files are still rejected.
- The file is read in the browser (`src/pdf/text-source.ts`) and split into pages:
  - **LaTeX:** the preamble before `\begin{document}` is dropped. Pages split at `\chapter` and `\section` (starred too), and subsections stay inside their section.
  - **Markdown:** pages split at `#` and `##` headings, never inside code fences.
  - Sections longer than 8,000 characters are split at blank lines.
  - The section titles become the source's outline.
- The text is stored as `source_pages` (`has_text` true) and no file is stored, because the bucket holds PDFs only. `read_pages`, `search`, citations and plans then work on it like PDF pages. The tutor can also send the same content through `save_pages` (§1).

## 3. Acceptance

- In a chat, attaching 3 photos of handwritten notes and asking "save these to Lemma" creates a source of kind notes with 3 pages, found by `search` and readable by `read_pages`.
- Transcribing pages 1–10 of an uploaded scan makes `search` find words from those pages only. The Sources tab shows "10 of 40 pages transcribed".
- `undo` of a save restores the previous text, or removes the source when the save created it.
- The exported .tex compiles with a standard preamble (`amsmath`, `amssymb`).
- Stress (ST-0 profile X): a 400-page transcribed source keeps search under 1 s, and the page viewer pages without loading all 400 pages.
- Uploading a `.tex` with three sections creates a source with three pages and an outline; `search` finds a word from the second section.
