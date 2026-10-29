-- DB-1: new Lemma schema (data.md §2). Reset is the separately authorized one-time step.
create or replace function public.lemma_valid_steps(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb;
begin
 if jsonb_typeof(value) <> 'array' then return false; end if;
 if jsonb_array_length(value) not between 1 and 8 then return false; end if;
 for item in select * from jsonb_array_elements(value) loop
  if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') not between 1 and 80 then return false; end if;
 end loop;
 return true;
end $$;
create table public.settings (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key(user_id),
 desired_retention real not null default 0.90 check(desired_retention between 0.80 and 0.97),
 new_per_day int not null default 20 check(new_per_day between 0 and 200),
 reviews_per_day int not null default 200 check(reviews_per_day between 0 and 2000),
 learn_steps text not null default '1m 10m', relearn_steps text not null default '10m',
 rollover_hour int not null default 4 check(rollover_hour between 0 and 23),
 max_interval_days int not null default 36500 check(max_interval_days > 0), fuzz boolean not null default true,
 load_balance boolean not null default true, learn_ahead_minutes int not null default 20 check(learn_ahead_minutes >= 0),
 fsrs_weights real[] check(fsrs_weights is null or cardinality(fsrs_weights)=21), fsrs_tuned_at timestamptz,
 macros text not null default $macros$\newcommand{\R}{\mathbb{R}}
\newcommand{\N}{\mathbb{N}}
\newcommand{\Z}{\mathbb{Z}}
\newcommand{\Q}{\mathbb{Q}}
\newcommand{\C}{\mathbb{C}}
\newcommand{\abs}[1]{\left\lvert #1 \right\rvert}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
\newcommand{\inner}[2]{\left\langle #1, #2 \right\rangle}
\newcommand{\eps}{\varepsilon}
\DeclareMathOperator{\tr}{tr}
\DeclareMathOperator{\rank}{rank}
\DeclareMathOperator*{\argmax}{arg\,max}
\DeclareMathOperator*{\argmin}{arg\,min}$macros$, default_style text not null default 'socratic', tutor_rules text,
 mix_decks boolean not null default true, preferred_chat text not null default 'claude' check(preferred_chat in ('claude','chatgpt')),
 connector_secret text not null unique default encode(extensions.gen_random_bytes(24),'hex') check(connector_secret ~ '^[a-f0-9]{48}$'),
 connector_last_seen_at timestamptz, connector_last_client text check(connector_last_client in ('claude','chatgpt','other')),
 time_zone text not null default 'UTC', updated_at timestamptz not null default now()
);

create table public.subjects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), name text not null check(char_length(name) between 1 and 40),
 glyph text not null check(char_length(glyph) between 1 and 2), hue text not null check(hue in ('amber','violet','cyan','rose','lime','slate')),
 position int not null default 0, unique(user_id,id)
);

create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
 subject_id uuid not null, title text not null check(char_length(title) between 1 and 80), goal text not null check(char_length(goal) between 1 and 1200),
 style text not null default 'socratic', status text not null default 'planning' check(status in ('planning','active','paused','done')),
 next_session_number int not null default 1 check(next_session_number>0), last_activity_at timestamptz,
 updated_at timestamptz not null default now(), unique(user_id,id), unique(user_id,slug),
 foreign key(user_id,subject_id) references public.subjects(user_id,id) on delete restrict
);

create table public.sources (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, title text not null check(char_length(title) between 1 and 120),
 short text not null check(char_length(short) between 1 and 20), filename text not null default '', storage_path text, bytes bigint check(bytes>=0),
 page_count int check(page_count>=0), status text not null default 'uploading' check(status in ('uploading','extracting','ready','failed')),
 has_text boolean not null default true, outline jsonb not null default '[]' check(jsonb_typeof(outline)='array'), error text,
 unique(user_id,id), unique(project_id,short), foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade
);

create table public.source_pages (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), source_id uuid not null, page int not null check(page>0), label text,
 body text not null default '' check(char_length(body)<=20000), chars int generated always as (length(body)) stored,
 tsv tsvector generated always as (to_tsvector('english'::regconfig,body)) stored, primary key(source_id,page),
 foreign key(user_id,source_id) references public.sources(user_id,id) on delete cascade
);

create table public.concepts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), subject_id uuid not null, slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(char_length(name) between 1 and 60), blurb text check(char_length(blurb)<=200), pin_x real, pin_y real,
 unique(user_id,id), unique(user_id,subject_id,slug), foreign key(user_id,subject_id) references public.subjects(user_id,id) on delete cascade
);

create table public.concept_links (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), from_id uuid not null, to_id uuid not null, kind text not null check(kind in ('prereq','related')),
 primary key(from_id,to_id), check(from_id<>to_id),
 foreign key(user_id,from_id) references public.concepts(user_id,id) on delete cascade,
 foreign key(user_id,to_id) references public.concepts(user_id,id) on delete cascade
);

create table public.checkpoints (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, code text not null check(code ~ '^CP[0-9]{1,3}[a-z]?$'), position real not null,
 title text not null check(char_length(title) between 1 and 80), objective text not null check(char_length(objective) between 1 and 400),
 criterion text not null check(char_length(criterion) between 1 and 400), steps jsonb not null default '[]' check(public.lemma_valid_steps(steps)),
 pages text, source_id uuid, status text not null default 'not_started' check(status in ('not_started','in_progress','demonstrated')),
 current_step int not null default 0 check(current_step>=0 and current_step<=jsonb_array_length(steps)), demonstrated_at timestamptz,
 recheck_level int not null default 0 check(recheck_level between 0 and 4), recheck_due date, recheck_prompt text check(char_length(recheck_prompt)<=300),
 needs_revisit boolean not null default false, updated_at timestamptz not null default now(), unique(user_id,id), unique(project_id,code),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,source_id) references public.sources(user_id,id) on delete set null (source_id)
);

create table public.checkpoint_prereqs (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), checkpoint_id uuid not null, prereq_id uuid not null, primary key(checkpoint_id,prereq_id), check(checkpoint_id<>prereq_id),
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete cascade,
 foreign key(user_id,prereq_id) references public.checkpoints(user_id,id) on delete cascade
);

create table public.checkpoint_concepts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), checkpoint_id uuid not null, concept_id uuid not null, primary key(checkpoint_id,concept_id),
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete cascade,
 foreign key(user_id,concept_id) references public.concepts(user_id,id) on delete cascade
);

create table public.styles (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), key text not null check(key ~ '^[a-z_]{2,20}$'), name text not null check(char_length(name) between 1 and 24),
 icon text not null, instructions text not null check(char_length(instructions) between 1 and 500), position int not null default 0, primary key(user_id,key)
);

create table public.sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, number int not null check(number>0), goal text not null check(char_length(goal) between 1 and 200),
 style text not null, checkpoint_id uuid, client text not null default 'other' check(client in ('claude','chatgpt','other')),
 state text not null default 'open' check(state in ('open','ended')), goal_met text check(goal_met in ('yes','partial','no')),
 summary text check(char_length(summary)<=600), resume_step int check(resume_step between 1 and 8), resume_question text check(char_length(resume_question)<=300),
 resume_note text check(char_length(resume_note)<=300), started_at timestamptz not null default now(), last_activity_at timestamptz not null default now(),
 ended_at timestamptz, minutes int check(minutes between 0 and 600), unique(user_id,id), unique(project_id,number),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete set null (checkpoint_id)
);

create table public.session_events (
 id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), session_id uuid not null, checkpoint_id uuid,
 kind text not null check(kind in ('pretest','attempt','hint','explanation','misconception','evidence','recheck','note')),
 body text not null check(char_length(body) between 1 and 600), outcome text check(outcome in ('demonstrated','partial','failed')),
 hint_level smallint check(hint_level between 1 and 4),
 foreign key(user_id,session_id) references public.sessions(user_id,id) on delete cascade,
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete set null (checkpoint_id)
);

create table public.misconceptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, concept_id uuid, label text not null check(char_length(label) between 1 and 120),
 times int not null default 1 check(times>0), last_seen_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,concept_id) references public.concepts(user_id,id) on delete set null (concept_id)
);

create table public.notes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), no bigint generated always as identity unique, project_id uuid not null, checkpoint_id uuid, session_id uuid, concept_id uuid,
 kind text not null default 'other' check(kind in ('definition','theorem','why','example','counterexample','proof','other')),
 type text not null default 'basic' check(type in ('basic','cloze','reverse')),
 front text not null check(char_length(front) between 1 and 1500), back text not null default '' check(char_length(back)<=3000),
 source_id uuid, page_label text, tags text[] not null default '{}', status text not null default 'active' check(status in ('active','suspended','deleted')),
 origin text not null default 'user' check(origin in ('user','claude','chatgpt','other')), updated_at timestamptz not null default now(), unique(user_id,id),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete set null (checkpoint_id),
 foreign key(user_id,session_id) references public.sessions(user_id,id) on delete set null (session_id),
 foreign key(user_id,concept_id) references public.concepts(user_id,id) on delete set null (concept_id),
 foreign key(user_id,source_id) references public.sources(user_id,id) on delete set null (source_id)
);

create table public.cards (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), note_id uuid not null, ord int not null check(ord>0), state smallint not null default 0 check(state between 0 and 3),
 due timestamptz not null default now(), stability real not null default 0 check(stability>=0), difficulty real not null default 0 check(difficulty between 0 and 10),
 last_review timestamptz, step int not null default 0 check(step>=0), reps int not null default 0 check(reps>=0), lapses int not null default 0 check(lapses>=0),
 unique(user_id,id), unique(note_id,ord), foreign key(user_id,note_id) references public.notes(user_id,id) on delete cascade
);

create table public.reviews (
 id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), card_id uuid not null, reviewed_at timestamptz not null default now(),
 rating smallint not null check(rating between 1 and 4), state_before smallint not null check(state_before between 0 and 3),
 confidence text check(confidence in ('sure','unsure','guess')), duration_ms int not null check(duration_ms between 0 and 600000),
 prev jsonb not null check(jsonb_typeof(prev)='object'), undone_at timestamptz,
 foreign key(user_id,card_id) references public.cards(user_id,id) on delete cascade
);

create table public.proposals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), no bigint generated always as identity unique, project_id uuid not null, session_id uuid,
 kind text not null check(kind in ('card','card_edit','plan','plan_change')), payload jsonb not null check(jsonb_typeof(payload)='object'),
 reason text check(char_length(reason)<=300), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 origin text not null check(origin in ('claude','chatgpt','other')), decided_at timestamptz, result jsonb, unique(user_id,id),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,session_id) references public.sessions(user_id,id) on delete set null (session_id)
);

create table public.card_comments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz not null default now(), no bigint generated always as identity unique, note_id uuid not null, body text not null check(char_length(body) between 1 and 500),
 status text not null default 'open' check(status in ('open','addressed','dismissed')), resolved_at timestamptz, resolved_by_proposal uuid,
 foreign key(user_id,note_id) references public.notes(user_id,id) on delete cascade,
 foreign key(user_id,resolved_by_proposal) references public.proposals(user_id,id) on delete set null (resolved_by_proposal)
);

create unique index subjects_owner_name on public.subjects(user_id,lower(name));
create unique index misconceptions_project_label on public.misconceptions(project_id,lower(label));
create index source_pages_search on public.source_pages using gin(tsv);
create index source_pages_label on public.source_pages(source_id,label);
create index sessions_project_activity on public.sessions(project_id,last_activity_at desc);
create index session_events_session_order on public.session_events(session_id,id);
create index cards_owner_due on public.cards(user_id,due);
create index reviews_card_time on public.reviews(card_id,reviewed_at);
create index reviews_owner_time on public.reviews(user_id,reviewed_at);
create index proposals_owner_status on public.proposals(user_id,status);
create index projects_subject_id_owner on public.projects(user_id,subject_id);
create index sources_project_id_owner on public.sources(user_id,project_id);
create index source_pages_owner on public.source_pages(user_id);
create index source_pages_source_id_owner on public.source_pages(user_id,source_id);
create index concepts_subject_id_owner on public.concepts(user_id,subject_id);
create index concept_links_owner on public.concept_links(user_id);
create index concept_links_from_id_owner on public.concept_links(user_id,from_id);
create index concept_links_to_id_owner on public.concept_links(user_id,to_id);
create index checkpoints_project_id_owner on public.checkpoints(user_id,project_id);
create index checkpoints_source_id_owner on public.checkpoints(user_id,source_id);
create index checkpoint_prereqs_owner on public.checkpoint_prereqs(user_id);
create index checkpoint_prereqs_checkpoint_id_owner on public.checkpoint_prereqs(user_id,checkpoint_id);
create index checkpoint_prereqs_prereq_id_owner on public.checkpoint_prereqs(user_id,prereq_id);
create index checkpoint_concepts_owner on public.checkpoint_concepts(user_id);
create index checkpoint_concepts_checkpoint_id_owner on public.checkpoint_concepts(user_id,checkpoint_id);
create index checkpoint_concepts_concept_id_owner on public.checkpoint_concepts(user_id,concept_id);
create index sessions_project_id_owner on public.sessions(user_id,project_id);
create index sessions_checkpoint_id_owner on public.sessions(user_id,checkpoint_id);
create index session_events_owner on public.session_events(user_id);
create index session_events_session_id_owner on public.session_events(user_id,session_id);
create index session_events_checkpoint_id_owner on public.session_events(user_id,checkpoint_id);
create index misconceptions_owner on public.misconceptions(user_id);
create index misconceptions_project_id_owner on public.misconceptions(user_id,project_id);
create index misconceptions_concept_id_owner on public.misconceptions(user_id,concept_id);
create index notes_project_id_owner on public.notes(user_id,project_id);
create index notes_checkpoint_id_owner on public.notes(user_id,checkpoint_id);
create index notes_session_id_owner on public.notes(user_id,session_id);
create index notes_concept_id_owner on public.notes(user_id,concept_id);
create index notes_source_id_owner on public.notes(user_id,source_id);
create index cards_note_id_owner on public.cards(user_id,note_id);
create index reviews_owner on public.reviews(user_id);
create index reviews_card_id_owner on public.reviews(user_id,card_id);
create index proposals_project_id_owner on public.proposals(user_id,project_id);
create index proposals_session_id_owner on public.proposals(user_id,session_id);
create index card_comments_owner on public.card_comments(user_id);
create index card_comments_note_id_owner on public.card_comments(user_id,note_id);
create index card_comments_resolved_by_proposal_owner on public.card_comments(user_id,resolved_by_proposal);
