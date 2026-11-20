-- Bounded owner uploads. A path is exactly <owner UUID>/<attachment UUID>.
create table public.tutor_turn_attachments (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 turn_id uuid not null,
 position smallint not null check (position between 0 and 2),
 kind text not null check (kind in ('drawing','photo')),
 mime_type text not null check (mime_type in ('image/png','image/jpeg')),
 byte_size integer not null check (byte_size between 1 and 1048576),
 unique (user_id,turn_id,position),
 foreign key (user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
alter table public.tutor_turn_attachments enable row level security;
revoke insert,update,delete,truncate on public.tutor_turn_attachments from anon,authenticated;
grant select on public.tutor_turn_attachments to authenticated,service_role;
create policy "Tutor owner reads attachments" on public.tutor_turn_attachments
 for select to authenticated using (user_id=(select auth.uid()));

do $storage$
begin
 if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
  insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('tutor-ink','tutor-ink',false,1048576,array['image/png','image/jpeg']);
  create policy "Tutor owner uploads ink" on storage.objects
   for insert to authenticated with check (
    bucket_id='tutor-ink' and (storage.foldername(name))=array[(select auth.uid())::text]
    and storage.filename(name) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   );
  create policy "Tutor owner reads ink" on storage.objects
   for select to authenticated using (
    bucket_id='tutor-ink' and (storage.foldername(name))=array[(select auth.uid())::text]
   );
 end if;
end $storage$;
insert into lemma_export_private.additional_tables (table_name)
values ('tutor_turn_attachments') on conflict (table_name) do nothing;

-- The existing learner command and all binds commit or roll back together.
-- Its checkpoint lock also serializes replays with the text-only client.
create function public.tutor_owner_ink_command(
 p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb,p_attachments jsonb
) returns jsonb language plpgsql security definer set search_path='' as $ink$
declare
 u uuid:=auth.uid();
 opid uuid:=(p_command->>'operationId')::uuid;
 ids uuid[];
 previous uuid;
 result jsonb;
 attachment record;
 object record;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Authenticated tutor owner required' using errcode='42501';
 end if;
 if p_command->>'operation' is distinct from 'start' or jsonb_typeof(p_attachments) is distinct from 'array'
  or jsonb_array_length(p_attachments) not between 1 and 3 or pg_column_size(p_attachments)>2048 then
  raise exception 'Invalid tutor images' using errcode='22023';
 end if;
 select array_agg((a.value->>'id')::uuid order by a.ordinality) into ids
  from jsonb_array_elements(p_attachments) with ordinality a;
 if (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then
  raise exception 'Attachments must be distinct' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':tutor:'||p_checkpoint::text,0));
 select id into previous from public.tutor_turns where user_id=u and client_turn_id=opid;
 result:=public.tutor_owner_command(u,p_slug,p_checkpoint,p_command);
 if result->>'status' is distinct from 'submitted' then return result; end if;
 if previous is not null then
  if ids is distinct from (select array_agg(a.id order by a.position) from public.tutor_turn_attachments a
     where a.user_id=u and a.turn_id=previous) then
   raise exception 'The saved turn has different images' using errcode='22023';
  end if;
  return result;
 end if;
 for attachment in select a.value,a.ordinality from jsonb_array_elements(p_attachments) with ordinality a loop
  select s.metadata->>'mimetype' mime,(s.metadata->>'size')::integer bytes into object
   from storage.objects s where s.bucket_id='tutor-ink'
    and s.name=u::text||'/'||(attachment.value->>'id')::uuid::text and s.owner_id=u::text
    and s.created_at>statement_timestamp()-interval '24 hours';
  if not found or object.mime is distinct from attachment.value->>'mimeType' then
   raise exception 'Tutor image is unavailable' using errcode='22023';
  end if;
  insert into public.tutor_turn_attachments(id,user_id,turn_id,position,kind,mime_type,byte_size)
   values ((attachment.value->>'id')::uuid,u,(result->>'turnId')::uuid,
     attachment.ordinality-1,attachment.value->>'kind',object.mime,object.bytes);
 end loop;
 return result;
end $ink$;
revoke all on function public.tutor_owner_ink_command(uuid,text,uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.tutor_owner_ink_command(uuid,text,uuid,jsonb,jsonb) to authenticated;

-- A candidate can no longer be bound once it is 24 hours old. The worker
-- deletes via the Storage API, so bytes and metadata are removed together.
create function public.tutor_ink_cleanup_candidates() returns text[]
language plpgsql stable security definer set search_path='' as $cleanup$
begin
 if to_regclass('storage.objects') is null then return '{}'::text[]; end if;
 return (select coalesce(array_agg(candidate.name),'{}')
 from (
  select s.name from storage.objects s
   where s.bucket_id='tutor-ink' and s.created_at<=statement_timestamp()-interval '24 hours'
    and not exists(select 1 from public.tutor_turn_attachments a where s.name=a.user_id::text||'/'||a.id::text)
   order by s.created_at,s.name limit 100
 ) candidate);
end $cleanup$;
revoke all on function public.tutor_ink_cleanup_candidates() from public,anon,authenticated;
grant execute on function public.tutor_ink_cleanup_candidates() to service_role;

-- The existing authenticated worker also runs when reminders are disabled.
do $schedule$
begin
 if to_regclass('cron.job') is not null and to_regclass('vault.decrypted_secrets') is not null
  and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
  perform cron.schedule('lemma-tutor-ink-cleanup','23 * * * *',$job$
   select net.http_post(
     url:='https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/push',
     body:='{"tutorInkCleanup":true}'::jsonb,
     headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',decrypted_secret),
     timeout_milliseconds:=25000)
   from vault.decrypted_secrets where name='push_shared_secret';
  $job$);
 end if;
end $schedule$;

create or replace function public.tutor_turn_json(p_user uuid, p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $dto$
 select jsonb_strip_nulls(jsonb_build_object(
  'id',t.id,'threadId',t.thread_id,'sequence',t.sequence,'version',t.version,
  'status',case t.status when 'pending' then 'awaiting-tutor' else t.status end,
   'snapshot',t.snapshot||coalesce((select jsonb_build_object('attachments',jsonb_agg(
    jsonb_build_object('id',a.id,'mimeType',a.mime_type,'kind',a.kind) order by a.position))
   from public.tutor_turn_attachments a where a.user_id=t.user_id and a.turn_id=t.id),'{}'::jsonb),
  'createdAt',t.created_at,
  'claimExpiresAt',(select a.lease_until from public.tutor_attempts a
   where a.turn_id=t.id and a.generation=t.generation and a.finished_at is null
   and a.lease_until>statement_timestamp()),
  'finalReply',case when r.id is not null then jsonb_build_object(
   'turnId',t.id,'messageId',r.id,'body',r.body,'citations',r.citations,'nextQuestion',r.next_question,
   'provenance',case r.provenance when 'manual' then '{"kind":"manual-import","label":"Imported by you"}'::jsonb
    else jsonb_build_object('kind','connector','reportedHost',r.reported_host,'hostVerified',false) end,
   'suggestions',coalesce((select jsonb_agg(jsonb_build_object('intentId',s.id,'kind',p.kind,
     'summary',p.reason,'sourceMessageId',r.id,'status',p.status,'proposalId',p.id) order by p.no)
    from public.tutor_suggestions s join public.proposals p on p.id=s.proposal_id and p.user_id=t.user_id
    where s.turn_id=t.id),'[]'::jsonb)) end))
 from public.tutor_turns t left join public.tutor_replies r on r.turn_id=t.id
 where t.user_id=p_user and t.id=p_id
$dto$;
