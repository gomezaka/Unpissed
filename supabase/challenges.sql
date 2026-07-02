-- Unpissed friend challenges.
-- Safe to run after supabase/schema.sql on existing projects.

begin;

create table if not exists public.challenge_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Last Throne Standing',
  mode text not null default 'last_throne_standing' check (mode in ('last_throne_standing','first_to_go')),
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  visibility text not null default 'friends' check (visibility in ('private','friends')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists challenge_sessions_set_updated_at on public.challenge_sessions;
create trigger challenge_sessions_set_updated_at
before update on public.challenge_sessions
for each row execute function public.set_updated_at();

create table if not exists public.challenge_participants (
  session_id uuid not null references public.challenge_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'standing' check (status in ('standing','gone','left')),
  joined_at timestamptz not null default now(),
  first_gone_at timestamptz,
  first_checkin_id uuid references public.checkins(id) on delete set null,
  first_bathroom_id uuid references public.bathrooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

drop trigger if exists challenge_participants_set_updated_at on public.challenge_participants;
create trigger challenge_participants_set_updated_at
before update on public.challenge_participants
for each row execute function public.set_updated_at();

create table if not exists public.challenge_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.challenge_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('joined','left','checkin','finished')),
  checkin_id uuid references public.checkins(id) on delete set null,
  bathroom_id uuid references public.bathrooms(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists challenge_sessions_created_by_idx on public.challenge_sessions (created_by, status, created_at desc);
create index if not exists challenge_participants_user_idx on public.challenge_participants (user_id, status);
create index if not exists challenge_participants_session_idx on public.challenge_participants (session_id, first_gone_at);
create index if not exists challenge_events_session_idx on public.challenge_events (session_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenge_sessions_text_limits') then
    alter table public.challenge_sessions add constraint challenge_sessions_text_limits check (
      char_length(title) between 1 and 120
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'challenge_events_payload_limits') then
    alter table public.challenge_events add constraint challenge_events_payload_limits check (
      pg_column_size(payload) <= 4096
    ) not valid;
  end if;
end;
$$;

grant select, insert, update, delete on public.challenge_sessions to authenticated;
grant select, insert, update, delete on public.challenge_participants to authenticated;
grant select, insert, update, delete on public.challenge_events to authenticated;

drop policy if exists "challenge sessions visible" on public.challenge_sessions;
drop policy if exists "users create own challenges" on public.challenge_sessions;
drop policy if exists "creators update own challenges" on public.challenge_sessions;
drop policy if exists "challenge participants readable" on public.challenge_participants;
drop policy if exists "users join challenges as self" on public.challenge_participants;
drop policy if exists "users update own challenge participant row" on public.challenge_participants;
drop policy if exists "challenge events readable" on public.challenge_events;
drop policy if exists "users create own challenge events" on public.challenge_events;

alter table public.challenge_sessions enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_events enable row level security;

create policy "challenge sessions visible" on public.challenge_sessions for select using (
  auth.uid() = created_by
  or (
    auth.uid() is not null
    and visibility = 'friends'
    and exists (
      select 1
      from public.follows viewer_to_creator
      where viewer_to_creator.follower_id = auth.uid()
        and viewer_to_creator.following_id = created_by
    )
    and exists (
      select 1
      from public.follows creator_to_viewer
      where creator_to_viewer.follower_id = created_by
        and creator_to_viewer.following_id = auth.uid()
    )
  )
  or exists (
    select 1
    from public.challenge_participants p
    where p.session_id = id
      and p.user_id = auth.uid()
      and p.status <> 'left'
  )
);

create policy "users create own challenges" on public.challenge_sessions for insert with check (auth.uid() = created_by);
create policy "creators update own challenges" on public.challenge_sessions for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "challenge participants readable" on public.challenge_participants for select using (auth.uid() is not null);
create policy "users join challenges as self" on public.challenge_participants for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenge_sessions s
    where s.id = session_id
      and s.status = 'active'
  )
);
create policy "users update own challenge participant row" on public.challenge_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "challenge events readable" on public.challenge_events for select using (auth.uid() is not null);
create policy "users create own challenge events" on public.challenge_events for insert with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.challenge_participants p
    where p.session_id = session_id
      and p.user_id = auth.uid()
      and p.status <> 'left'
  )
);

notify pgrst, 'reload schema';

commit;
