-- Messages people send to the FoodTrip assistant, kept anonymously to make the
-- assistant better: what it understood (intent, slots, which reader — the
-- trained model or the rules — and how sure), and whether the person found the
-- answer helpful. These are the real messages the next training round is
-- labelled from (ml/assistant).
--
-- No user id, and the Edge Function `assistant` removes phone numbers and email
-- addresses before storing. Written and read only by the Edge Function with the
-- service role; no API role reads or writes the table.

begin;

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 600),
  lang text not null default 'vi' check (lang in ('vi', 'en')),
  intent text not null check (char_length(intent) <= 40),
  confidence real check (confidence is null or confidence between 0 and 1),
  source text not null check (source in ('model', 'rules')),
  slots jsonb not null default '[]' check (jsonb_typeof(slots) = 'array'),
  helpful boolean,
  created_at timestamptz not null default now()
);
create index assistant_messages_created_idx on public.assistant_messages (created_at desc);
alter table public.assistant_messages enable row level security;
revoke all on public.assistant_messages from anon, authenticated;

notify pgrst, 'reload schema';
commit;
