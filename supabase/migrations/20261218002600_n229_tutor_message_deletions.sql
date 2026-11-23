-- Deleting messages removes them from the owner's transcript. Keep turn receipts,
-- in-flight handoffs, and independently accepted study records intact.
create table public.tutor_message_deletions (
 user_id uuid not null,
 turn_id uuid not null,
 kind text not null check (kind in ('question','reply','followup')),
 message_id uuid not null,
 primary key(user_id,kind,message_id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
create index tutor_message_deletions_turn on public.tutor_message_deletions(user_id,turn_id);
alter table public.tutor_message_deletions enable row level security;
revoke insert, update, delete, truncate on public.tutor_message_deletions from anon, authenticated;
create trigger lemma_account_delete_write_guard before insert or update or delete on public.tutor_message_deletions
 for each row execute function public.lemma_block_account_deletion_writes();
insert into lemma_export_private.additional_tables(table_name) values ('tutor_message_deletions');

create function public.tutor_delete_messages(p_owner uuid,p_slug text,p_checkpoint uuid,p_messages jsonb)
returns boolean language plpgsql security definer set search_path='' as $delete_messages$
declare
 u uuid:=auth.uid();
 thread uuid;
 target_turn uuid;
 message record;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to edit the tutor transcript' using errcode='42501';
 end if;
 select h.id into thread
 from public.tutor_threads h
 join public.projects p on p.user_id=h.user_id and p.id=h.project_id
 where h.user_id=u and h.checkpoint_id=p_checkpoint and p.slug=p_slug;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then
  raise exception 'Tutor conversation is unavailable' using errcode='42501';
 end if;
 if jsonb_typeof(p_messages) is distinct from 'array' then
  raise exception 'Select messages to delete' using errcode='22023';
 end if;
 if jsonb_array_length(p_messages) not between 1 and 100 then
  raise exception 'Select between 1 and 100 messages' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':tutor:'||p_checkpoint::text,0));
 for message in select * from jsonb_to_recordset(p_messages) as item(kind text,id uuid) loop
  case message.kind
   when 'question' then target_turn:=message.id;
   when 'reply' then
    select r.turn_id into target_turn from public.tutor_replies r where r.user_id=u and r.id=message.id;
   when 'followup' then
    select f.turn_id into target_turn from public.tutor_followups f where f.user_id=u and f.id=message.id;
   else raise exception 'Message type is unavailable' using errcode='22023';
  end case;
  if not exists(select 1 from public.tutor_turns t where t.user_id=u and t.id=target_turn and t.thread_id=thread) then
   raise exception 'One of the selected messages is unavailable' using errcode='42501';
  end if;
  insert into public.tutor_message_deletions(user_id,turn_id,kind,message_id)
   values(u,target_turn,message.kind,message.id) on conflict do nothing;
 end loop;
 return true;
end $delete_messages$;
revoke all on function public.tutor_delete_messages(uuid,text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.tutor_delete_messages(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.tutor_turn_json(p_user uuid, p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $dto$
 select jsonb_strip_nulls(jsonb_build_object(
  'id',t.id,'threadId',t.thread_id,'sequence',t.sequence,'version',t.version,
  'status',case t.status when 'pending' then 'awaiting-tutor' else t.status end,
   'snapshot',t.snapshot||coalesce((select jsonb_build_object('attachments',jsonb_agg(
    jsonb_build_object('id',a.id,'mimeType',a.mime_type,'kind',a.kind) order by a.position))
   from public.tutor_turn_attachments a where a.user_id=t.user_id and a.turn_id=t.id),'{}'::jsonb),
  'createdAt',t.created_at,
  'questionDeleted',case when exists(select 1 from public.tutor_message_deletions d
    where d.user_id=t.user_id and d.kind='question' and d.message_id=t.id) then true end,
  'replyDeleted',case when exists(select 1 from public.tutor_message_deletions d
    where d.user_id=t.user_id and d.kind='reply' and d.message_id=r.id) then true end,
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

create or replace function public.tutor_followup_state(p_owner uuid, p_slug text, p_checkpoint uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fstate$
declare u uuid:=auth.uid(); cp public.checkpoints%rowtype; h public.tutor_threads%rowtype;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to open the tutor' using errcode='42501';
 end if;
 select c.* into cp from public.checkpoints c join public.projects p on p.id=c.project_id and p.user_id=c.user_id
 where c.id=p_checkpoint and c.user_id=u and p.slug=p_slug;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then
  raise exception 'Checkpoint is unavailable' using errcode='42501';
 end if;
 select * into h from public.tutor_threads where user_id=u and checkpoint_id=cp.id;
 return coalesce((select jsonb_agg(public.tutor_followup_json(f) order by t.sequence,f.created_at,f.id)
  from public.tutor_followups f join public.tutor_turns t on t.user_id=f.user_id and t.id=f.turn_id
  where f.user_id=u and t.thread_id=h.id and not exists(
    select 1 from public.tutor_message_deletions d where d.user_id=u and d.kind='followup' and d.message_id=f.id)),'[]'::jsonb);
end $fstate$;
