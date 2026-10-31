-- DB-5: additive provenance for tutor-transcribed scanned/handwritten pages.
-- Existing uploads and extracted page text remain unchanged. No live data is
-- backfilled or rewritten, and the existing source/page action triggers keep
-- transcription writes undoable via public.undo_action.
alter table public.sources
  add column origin text not null default 'user'
    constraint sources_origin_check check (origin in ('user', 'claude', 'chatgpt', 'other'));

alter table public.source_pages
  add column transcribed_by text
    constraint source_pages_transcribed_by_check
      check (transcribed_by in ('claude', 'chatgpt')),
  add column transcribed_at timestamptz,
  add column confidence text
    constraint source_pages_confidence_check
      check (confidence in ('high', 'check'));

comment on column public.sources.origin is
  'Creator of the source: user, Claude, ChatGPT or other; original uploads default to user.';
comment on column public.source_pages.transcribed_by is
  'Tutor that supplied this page transcription; null for ordinary PDF text extraction.';
comment on column public.source_pages.transcribed_at is
  'Timestamp of the most recent tutor transcription, not the original upload.';
comment on column public.source_pages.confidence is
  'Tutor assessment: high or check; null for untranscribed/ordinary extracted text.';
