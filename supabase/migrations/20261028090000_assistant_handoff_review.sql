-- The FoodTrip assistant, second round:
--
--   1. Hand-off to a person. From the chat, someone can send their question to
--      FoodTrip's team with the conversation attached. It arrives as a contact
--      message (source 'assistant'), so it is read, answered by email and
--      marked handled where the team already does that (Admin → Liên hệ).
--      A signed-in sender may attach their own account; nobody can attach
--      another's.
--   2. Review of what the assistant understood. Administrators read the stored
--      messages (Admin → Trợ lý), correct the intent where it was wrong and
--      export them as the next round's labelled data (ml/assistant). They can
--      also delete a message, e.g. one with personal details the redaction missed.

begin;

alter table public.contact_messages
  add column source text not null default 'contact' check (source in ('contact', 'assistant')),
  add column user_id uuid references auth.users (id) on delete set null,
  add column page text check (page is null or char_length(page) <= 200),
  add column transcript jsonb check (transcript is null or (
    jsonb_typeof(transcript) = 'array' and jsonb_array_length(transcript) <= 40 and octet_length(transcript::text) <= 24000));

drop policy if exists "contact_messages_public_insert" on public.contact_messages;
create policy contact_messages_public_insert on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

alter table public.assistant_messages
  add column reviewed_intent text check (reviewed_intent is null or char_length(reviewed_intent) <= 40),
  add column reviewed_at timestamptz;
create index assistant_messages_review_idx on public.assistant_messages (helpful, reviewed_at);

grant select, delete on public.assistant_messages to authenticated;
grant update (reviewed_intent, reviewed_at) on public.assistant_messages to authenticated;
create policy assistant_messages_admin_select on public.assistant_messages for select to authenticated
  using ((select public.is_admin()));
create policy assistant_messages_admin_update on public.assistant_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy assistant_messages_admin_delete on public.assistant_messages for delete to authenticated
  using ((select public.is_admin()));

notify pgrst, 'reload schema';
commit;
