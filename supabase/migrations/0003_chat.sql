-- In-game text chat (step 10).
-- Players of a game can read its messages and post as themselves; nobody
-- else can read or write them. New messages are pushed in real time.

create table public.messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_game_idx on public.messages (game_id, id);

alter table public.messages enable row level security;

create policy "players read the chat of their games" on public.messages
  for select to authenticated using (public.is_game_member(game_id));

create policy "players post in their games, as themselves" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_game_member(game_id));

-- Messages cannot be edited or deleted (no update / delete policy).

alter publication supabase_realtime add table public.messages;
