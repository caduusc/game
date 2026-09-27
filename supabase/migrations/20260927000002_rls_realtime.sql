-- Alergia — Row Level Security e Realtime
-- O cliente só LÊ. Toda escrita acontece nos Route Handlers, com conexão
-- privilegiada ao Postgres (que ignora RLS).

-- ============================================================ FUNÇÕES AUXILIARES

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where room_id = p_room and user_id = auth.uid()
  );
$$;

create or replace function public.owns_player(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where id = p_player and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_room uuid, p_team text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.players p on p.id = tm.player_id
    where tm.room_id = p_room and tm.team = p_team and p.user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.owns_player(uuid) from public;
revoke all on function public.is_team_member(uuid, text) from public;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.owns_player(uuid) to authenticated;
grant execute on function public.is_team_member(uuid, text) to authenticated;

-- ============================================================ RLS

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.announcements enable row level security;
alter table public.final_reveal enable row level security;
alter table public.player_secrets enable row level security;
alter table public.player_cards enable row level security;
alter table public.player_results enable row level security;
alter table public.team_members enable row level security;
alter table public.team_state enable row level security;

-- Públicas da sala: qualquer membro da sala lê.
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy players_select on public.players
  for select to authenticated using (public.is_room_member(room_id));

create policy announcements_select on public.announcements
  for select to authenticated using (public.is_room_member(room_id));

create policy final_reveal_select on public.final_reveal
  for select to authenticated using (public.is_room_member(room_id));

-- Segredos: só o dono do lugar (players.user_id = auth.uid()).
-- Como as policies passam por players.user_id, a reentrada troca apenas essa coluna.
create policy player_secrets_select on public.player_secrets
  for select to authenticated using (public.owns_player(player_id));

create policy player_cards_select on public.player_cards
  for select to authenticated using (public.owns_player(player_id));

create policy player_results_select on public.player_results
  for select to authenticated using (public.owns_player(player_id));

-- Equipes: só membros da equipe.
create policy team_members_select on public.team_members
  for select to authenticated using (public.is_team_member(room_id, team));

create policy team_state_select on public.team_state
  for select to authenticated using (public.is_team_member(room_id, team));

-- Sem INSERT/UPDATE/DELETE para os papéis do cliente.
do $$
declare
  t text;
begin
  foreach t in array array[
    'rooms', 'players', 'announcements', 'final_reveal', 'player_secrets',
    'player_cards', 'player_results', 'team_members', 'team_state'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- ============================================================ REALTIME
-- Postgres Changes respeita RLS: cada assinante só recebe as linhas que pode ler.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  public.rooms,
  public.players,
  public.announcements,
  public.final_reveal,
  public.player_secrets,
  public.player_cards,
  public.player_results,
  public.team_state;
