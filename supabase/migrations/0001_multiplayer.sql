-- MaitreMot — multiplayer schema (phase 2, steps 8 and 9).
--
-- Security model
-- ---------------
-- * Players sign in with an e-mail code (Supabase Auth); each has a profile
--   (display name + friend code) and a list of friends.
-- * A game's full state, including the bag and every rack, is in
--   `game_secrets`: no policy at all, so only the server (the `game` Edge
--   Function, with the service key) can read or write it.
-- * Players read the public part (`games.public_state`: board, scores,
--   history…) and ONLY their own rack (`game_racks`), thanks to Row Level
--   Security. Nobody can see the other players' letters.
-- * Every game change goes through the Edge Function, which validates the move
--   with the same engine as the app. Clients have no write access to game tables.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  -- Short code to share with friends (no ambiguous characters such as O/0, I/1).
  friend_code text not null unique check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  -- What every player may see (board, scores, history, bag and rack sizes).
  public_state jsonb,
  -- Incremented at every change: protects against two simultaneous updates.
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('invited', 'joined', 'declined')),
  primary key (game_id, user_id)
);
create index game_players_user_idx on public.game_players (user_id);

create table public.game_racks (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rack jsonb not null,
  primary key (game_id, user_id)
);

create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  -- The complete engine GameState (bag and all racks included).
  state jsonb not null
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: they read tables regardless of RLS, which
-- avoids policies that query their own table recursively)
-- ---------------------------------------------------------------------------

create function public.is_game_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_players where game_id = g and user_id = auth.uid());
$$;

create function public.can_see_profile(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid()
    or exists (select 1 from friendships where user_id = auth.uid() and friend_id = u)
    or exists (
      select 1 from game_players a join game_players b on a.game_id = b.game_id
      where a.user_id = auth.uid() and b.user_id = u
    );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only access for players, nothing else
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_racks enable row level security;
alter table public.game_secrets enable row level security; -- no policy: server only

create policy "see own, friends' and co-players' profiles" on public.profiles
  for select to authenticated using (public.can_see_profile(id));

create policy "see own friendships" on public.friendships
  for select to authenticated using (user_id = auth.uid());

create policy "see own games" on public.games
  for select to authenticated using (public.is_game_member(id));

create policy "see players of own games" on public.game_players
  for select to authenticated using (public.is_game_member(game_id));

create policy "see own rack only" on public.game_racks
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Functions callable by players (profile and friends)
-- ---------------------------------------------------------------------------

-- Creates the caller's profile (with a fresh friend code) or renames it.
create function public.save_profile(p_display_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  result profiles;
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set display_name = trim(p_display_name) where id = auth.uid() returning * into result;
  if found then return result; end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into profiles (id, display_name, friend_code)
      values (auth.uid(), trim(p_display_name), code) returning * into result;
      return result;
    exception when unique_violation then
      -- extremely rare: the code is already taken, draw another one
    end;
  end loop;
end;
$$;

-- Adds a friend from their friend code (both become friends of each other).
create function public.add_friend(p_friend_code text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  friend profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile missing';
  end if;
  select * into friend from profiles where friend_code = upper(trim(p_friend_code));
  if not found then raise exception 'unknown friend code'; end if;
  if friend.id = auth.uid() then raise exception 'cannot add yourself'; end if;
  insert into friendships (user_id, friend_id) values (auth.uid(), friend.id), (friend.id, auth.uid())
  on conflict do nothing;
  return friend;
end;
$$;

revoke all on function public.save_profile(text) from public, anon;
revoke all on function public.add_friend(text) from public, anon;
grant execute on function public.save_profile(text) to authenticated;
grant execute on function public.add_friend(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic game update, used by the Edge Function only (service role)
-- ---------------------------------------------------------------------------

-- Writes a new game state in one transaction, if nobody changed it meanwhile
-- (optimistic locking on `version`). Returns false on a conflict.
create function public.apply_game_update(
  p_game_id uuid,
  p_expected_version integer,
  p_status text,
  p_public_state jsonb,
  p_state jsonb,
  p_racks jsonb -- {"<user id>": [tiles…], …}
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update games
     set status = p_status, public_state = p_public_state,
         version = version + 1, updated_at = now()
   where id = p_game_id and version = p_expected_version;
  if not found then return false; end if;

  insert into game_secrets (game_id, state) values (p_game_id, p_state)
  on conflict (game_id) do update set state = excluded.state;

  insert into game_racks (game_id, user_id, rack)
  select p_game_id, key::uuid, value from jsonb_each(p_racks)
  on conflict (game_id, user_id) do update set rack = excluded.rack;
  return true;
end;
$$;

revoke all on function public.apply_game_update(uuid, integer, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_game_update(uuid, integer, text, jsonb, jsonb, jsonb)
  to service_role;

-- The helper functions are only meant for policies.
revoke all on function public.is_game_member(uuid) from public, anon;
revoke all on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;
grant execute on function public.can_see_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: clients are notified of changes to the rows they can read
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.games, public.game_players, public.game_racks;
