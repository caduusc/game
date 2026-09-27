-- Alergia — esquema principal
-- Tabelas públicas da sala, segredos por jogador, estado de equipe (schema public, com RLS)
-- e tabelas ocultas (schema game_private, sem acesso para o cliente).

create extension if not exists pgcrypto;

-- ============================================================ PÚBLICO DA SALA

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_player_id uuid,
  acting_host_player_id uuid,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  round_minutes integer not null default 5 check (round_minutes between 1 and 30),
  current_round integer not null default 0,
  ends_at timestamptz,
  paused_remaining_ms integer,
  resolved_round integer not null default 0,
  winner text check (winner in ('killers', 'good', 'none')),
  dev_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid,
  name text not null check (char_length(name) between 1 and 24),
  seat integer,
  status text not null default 'alive' check (status in ('alive', 'dead', 'arrested')),
  is_bot boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (room_id, seat),
  unique (room_id, user_id)
);
create index players_user_idx on public.players (user_id);
create index players_room_idx on public.players (room_id);

alter table public.rooms
  add constraint rooms_host_fk foreign key (host_player_id) references public.players (id) on delete set null,
  add constraint rooms_acting_host_fk foreign key (acting_host_player_id) references public.players (id) on delete set null;

create table public.announcements (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('death', 'arrest')),
  name text not null,
  seat integer not null,
  character_name text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, player_id)
);

create table public.final_reveal (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  name text not null,
  seat integer not null,
  role text not null,
  role_label text not null,
  character_name text not null,
  status text not null,
  primary key (room_id, player_id)
);

-- ============================================================ SEGREDOS POR JOGADOR

create table public.player_secrets (
  player_id uuid primary key references public.players (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  role text not null,
  role_label text not null,
  character_name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index player_secrets_room_idx on public.player_secrets (room_id);

create table public.player_cards (
  player_id uuid not null references public.players (id) on delete cascade,
  slot integer not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  step integer not null default 0,
  title text not null,
  prompt text not null,
  fields text not null check (fields in ('text', 'number', 'number_text')),
  status text not null check (status in ('open', 'done', 'gone')),
  feedback text,
  updated_at timestamptz not null default now(),
  primary key (player_id, slot)
);
create index player_cards_room_idx on public.player_cards (room_id);

create table public.player_results (
  player_id uuid not null references public.players (id) on delete cascade,
  idx integer not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (player_id, idx)
);
create index player_results_room_idx on public.player_results (room_id);

-- ============================================================ EQUIPES

create table public.team_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  team text not null check (team in ('killers', 'investigators')),
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (room_id, team, player_id)
);
create index team_members_player_idx on public.team_members (player_id);

create table public.team_state (
  room_id uuid not null references public.rooms (id) on delete cascade,
  team text not null check (team in ('killers', 'investigators')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, team)
);

-- ============================================================ OCULTO (sem acesso para o cliente)

create schema if not exists game_private;
revoke all on schema game_private from public;

create table game_private.characters (
  id text primary key,
  name text not null unique,
  birth date not null,
  country text not null,
  gender text not null check (gender in ('M', 'F')),
  origin text not null check (origin in ('BR', 'EX')),
  century text not null check (century in ('XIX', 'XX')),
  area text not null,
  weapon text not null unique,
  aliases text[] not null default '{}',
  weapon_aliases text[] not null default '{}',
  unique (gender, origin, century, area)
);

create table game_private.riddles (
  id integer primary key,
  question text not null unique,
  answers text[] not null check (cardinality(answers) > 0)
);

-- Estado completo do motor: papéis, personagens, arco, respostas das charadas,
-- ações da rodada. Só o servidor lê e escreve.
create table game_private.game_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table game_private.actions (
  id bigserial primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  player_id uuid not null references public.players (id) on delete cascade,
  slot integer not null,
  payload jsonb not null,
  feedback text,
  created_at timestamptz not null default now()
);
create index actions_room_idx on game_private.actions (room_id, round);

create table game_private.rejoin_codes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index rejoin_codes_lookup_idx on game_private.rejoin_codes (room_id, code_hash);

alter table game_private.characters enable row level security;
alter table game_private.riddles enable row level security;
alter table game_private.game_state enable row level security;
alter table game_private.actions enable row level security;
alter table game_private.rejoin_codes enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema game_private from anon';
    execute 'revoke all on schema game_private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema game_private from authenticated';
    execute 'revoke all on schema game_private from authenticated';
  end if;
end $$;
