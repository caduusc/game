-- Alergia — setup completo (migrations + seed). Gerado por scripts/generate-seed.ts.
-- Cole tudo no SQL Editor do Supabase e execute uma vez, num projeto novo.

-- ===== 20260927000001_schema.sql
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

-- ===== 20260927000002_rls_realtime.sql
-- Alergia — Row Level Security e Realtime
-- Pode ser executado mais de uma vez sem erro.
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
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_member(id));

drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists final_reveal_select on public.final_reveal;
create policy final_reveal_select on public.final_reveal
  for select to authenticated using (public.is_room_member(room_id));

-- Segredos: só o dono do lugar (players.user_id = auth.uid()).
-- Como as policies passam por players.user_id, a reentrada troca apenas essa coluna.
drop policy if exists player_secrets_select on public.player_secrets;
create policy player_secrets_select on public.player_secrets
  for select to authenticated using (public.owns_player(player_id));

drop policy if exists player_cards_select on public.player_cards;
create policy player_cards_select on public.player_cards
  for select to authenticated using (public.owns_player(player_id));

drop policy if exists player_results_select on public.player_results;
create policy player_results_select on public.player_results
  for select to authenticated using (public.owns_player(player_id));

-- Equipes: só membros da equipe.
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (public.is_team_member(room_id, team));

drop policy if exists team_state_select on public.team_state;
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

do $$
declare
  t text;
begin
  foreach t in array array[
    'rooms', 'players', 'announcements', 'final_reveal',
    'player_secrets', 'player_cards', 'player_results', 'team_state'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Faz a API (PostgREST) recarregar o cache de tabelas imediatamente.
notify pgrst, 'reload schema';

-- ===== seed.sql
-- Arquivo gerado por scripts/generate-seed.ts — não edite à mão.
insert into game_private.characters (id, name, birth, country, gender, origin, century, area, weapon, aliases, weapon_aliases) values
  ('machado', 'Machado de Assis', '1839-06-21', 'Brasil', 'M', 'BR', 'XIX', 'Arte', 'Café', array['machado']::text[], '{}'::text[]),
  ('santos-dumont', 'Santos Dumont', '1873-07-20', 'Brasil', 'M', 'BR', 'XIX', 'Ciência', 'Pólen', array['dumont', 'santos dumont']::text[], '{}'::text[]),
  ('getulio', 'Getúlio Vargas', '1882-04-19', 'Brasil', 'M', 'BR', 'XIX', 'Política', 'Canela', array['getulio', 'vargas']::text[], '{}'::text[]),
  ('jk', 'Juscelino Kubitschek', '1902-09-12', 'Brasil', 'M', 'BR', 'XX', 'Política', 'Amendoim', array['juscelino', 'kubitschek', 'jk']::text[], '{}'::text[]),
  ('niemeyer', 'Oscar Niemeyer', '1907-12-15', 'Brasil', 'M', 'BR', 'XX', 'Arte', 'Gergelim', array['niemeyer']::text[], '{}'::text[]),
  ('senna', 'Ayrton Senna', '1960-03-21', 'Brasil', 'M', 'BR', 'XX', 'Esporte', 'Camarão', array['senna']::text[], '{}'::text[]),
  ('isabel', 'Princesa Isabel', '1846-07-29', 'Brasil', 'F', 'BR', 'XIX', 'Política', 'Leite', array['isabel']::text[], '{}'::text[]),
  ('bertha', 'Bertha Lutz', '1894-08-02', 'Brasil', 'F', 'BR', 'XIX', 'Ciência', 'Mel', array['bertha', 'lutz']::text[], '{}'::text[]),
  ('tarsila', 'Tarsila do Amaral', '1886-09-01', 'Brasil', 'F', 'BR', 'XIX', 'Arte', 'Morango', array['tarsila']::text[], '{}'::text[]),
  ('zilda', 'Zilda Arns', '1934-08-25', 'Brasil', 'F', 'BR', 'XX', 'Ciência', 'Penicilina', array['zilda']::text[], '{}'::text[]),
  ('esther', 'Maria Esther Bueno', '1939-10-11', 'Brasil', 'F', 'BR', 'XX', 'Esporte', 'Látex', array['maria esther', 'esther bueno']::text[], '{}'::text[]),
  ('elis', 'Elis Regina', '1945-03-17', 'Brasil', 'F', 'BR', 'XX', 'Arte', 'Kiwi', array['elis']::text[], '{}'::text[]),
  ('van-gogh', 'Vincent van Gogh', '1853-03-30', 'Holanda', 'M', 'EX', 'XIX', 'Arte', 'Tomate', array['van gogh', 'gogh']::text[], '{}'::text[]),
  ('gandhi', 'Mahatma Gandhi', '1869-10-02', 'Índia', 'M', 'EX', 'XIX', 'Política', 'Soja', array['gandhi']::text[], '{}'::text[]),
  ('einstein', 'Albert Einstein', '1879-03-14', 'Alemanha', 'M', 'EX', 'XIX', 'Ciência', 'Ovo', array['einstein']::text[], '{}'::text[]),
  ('turing', 'Alan Turing', '1912-06-23', 'Inglaterra', 'M', 'EX', 'XX', 'Ciência', 'Mostarda', array['turing']::text[], '{}'::text[]),
  ('mandela', 'Nelson Mandela', '1918-07-18', 'África do Sul', 'M', 'EX', 'XX', 'Política', 'Nozes', array['mandela']::text[], '{}'::text[]),
  ('ali', 'Muhammad Ali', '1942-01-17', 'EUA', 'M', 'EX', 'XX', 'Esporte', 'Picada de abelha', array['muhammad ali', 'cassius clay']::text[], array['abelha', 'picada']::text[]),
  ('curie', 'Marie Curie', '1867-11-07', 'Polônia', 'F', 'EX', 'XIX', 'Ciência', 'Poeira', array['curie']::text[], '{}'::text[]),
  ('chanel', 'Coco Chanel', '1883-08-19', 'França', 'F', 'EX', 'XIX', 'Arte', 'Chocolate', array['chanel']::text[], '{}'::text[]),
  ('earhart', 'Amelia Earhart', '1897-07-24', 'EUA', 'F', 'EX', 'XIX', 'Esporte', 'Pelo de gato', array['earhart', 'amelia']::text[], '{}'::text[]),
  ('frida', 'Frida Kahlo', '1907-07-06', 'México', 'F', 'EX', 'XX', 'Arte', 'Abacaxi', array['frida', 'kahlo']::text[], '{}'::text[]),
  ('rosa-parks', 'Rosa Parks', '1913-02-04', 'EUA', 'F', 'EX', 'XX', 'Política', 'Peixe', array['rosa parks', 'parks']::text[], '{}'::text[]),
  ('nadia', 'Nadia Comăneci', '1961-11-12', 'Romênia', 'F', 'EX', 'XX', 'Esporte', 'Glúten', array['nadia', 'comaneci']::text[], '{}'::text[])
on conflict (id) do update set
  name = excluded.name, birth = excluded.birth, country = excluded.country, gender = excluded.gender,
  origin = excluded.origin, century = excluded.century, area = excluded.area, weapon = excluded.weapon,
  aliases = excluded.aliases, weapon_aliases = excluded.weapon_aliases;
delete from game_private.characters where id not in ('machado', 'santos-dumont', 'getulio', 'jk', 'niemeyer', 'senna', 'isabel', 'bertha', 'tarsila', 'zilda', 'esther', 'elis', 'van-gogh', 'gandhi', 'einstein', 'turing', 'mandela', 'ali', 'curie', 'chanel', 'earhart', 'frida', 'rosa-parks', 'nadia');

insert into game_private.riddles (id, question, answers) values
  (1, 'O que é, o que é: tem dentes mas não morde?', array['pente']::text[]),
  (2, 'O que é, o que é: quanto mais se tira, maior fica?', array['buraco']::text[]),
  (3, 'O que é, o que é: tem cabeça e tem dente, não é bicho nem é gente?', array['alho']::text[]),
  (4, 'O que é, o que é: cai em pé e corre deitada?', array['chuva']::text[]),
  (5, 'O que é, o que é: tem pescoço mas não tem cabeça?', array['garrafa']::text[]),
  (6, 'O que é, o que é: tem coroa mas não é rei, tem escamas mas não é peixe?', array['abacaxi']::text[]),
  (7, 'O que é, o que é: quanto mais seca, mais molhada fica?', array['toalha']::text[]),
  (8, 'O que é, o que é: tem um olho só e não enxerga?', array['agulha']::text[]),
  (9, 'O que é, o que é: tem ponteiros mas não aponta para ninguém?', array['relógio']::text[]),
  (10, 'O que é, o que é: tem degraus, você sobe e desce, mas ela não sai do lugar?', array['escada']::text[]),
  (11, 'O que é, o que é: tem asa mas não voa, tem bico mas não bica?', array['bule']::text[]),
  (12, 'O que é, o que é: tem chapéu mas não tem cabeça, nasce na mata úmida?', array['cogumelo']::text[]),
  (13, 'O que é, o que é: nasce grande e morre pequeno de tanto escrever?', array['lápis']::text[]),
  (14, 'O que é, o que é: quanto mais cresce, menos se vê?', array['escuridão']::text[]),
  (15, 'O que é, o que é: passa na frente do sol e não faz sombra?', array['vento']::text[]),
  (16, 'O que é, o que é: tem folhas mas não é árvore, tem capa mas não é herói?', array['livro']::text[]),
  (17, 'O que é, o que é: tem cidades mas não tem casas, tem rios mas não tem água?', array['mapa']::text[]),
  (18, 'O que é, o que é: te segue o dia todo e some quando apagam a luz?', array['sombra']::text[]),
  (19, 'O que é, o que é: fica cheio de dia e vazio de noite, e anda sempre em par?', array['sapato', 'sapatos']::text[]),
  (20, 'O que é, o que é: quanto mais quente, mais fresco é?', array['pão']::text[]),
  (21, 'O que é, o que é: corre mas não tem pernas, tem leito mas não dorme?', array['rio']::text[]),
  (22, 'O que é, o que é: cai da árvore no outono sem se machucar?', array['folha']::text[]),
  (23, 'O que é, o que é: sempre está chegando mas nunca chega?', array['amanhã']::text[]),
  (24, 'O que é, o que é: é seu, mas os outros usam mais do que você?', array['nome']::text[]),
  (25, 'O que é, o que é: tem barba, tem cabelo, e dá pipoca?', array['milho']::text[]),
  (26, 'O que é, o que é: basta dizer o nome dele para quebrá-lo?', array['silêncio']::text[]),
  (27, 'O que é, o que é: tem rabo mas não é bicho, voa mas não é pássaro?', array['pipa', 'papagaio', 'pandorga']::text[]),
  (28, 'O que é, o que é: tem quatro pernas mas não anda, e ninguém senta nela para comer?', array['mesa']::text[]),
  (29, 'O que é, o que é: quanto mais se lava, mais suja fica?', array['água']::text[]),
  (30, 'O que é, o que é: tem teclas mas não abre fechadura?', array['teclado', 'piano']::text[]),
  (31, 'O que é, o que é: abre quando a chuva cai e fecha quando ela passa?', array['guarda-chuva', 'sombrinha']::text[]),
  (32, 'O que é, o que é: se põe na mesa, se parte, se reparte, mas não se come?', array['baralho']::text[]),
  (33, 'O que é, o que é: só aparece de noite e pisca lá no alto?', array['estrela']::text[]),
  (34, 'O que é, o que é: tem casco, anda devagar e vive muitos anos?', array['tartaruga']::text[]),
  (35, 'O que é, o que é: quanto mais você anda, mais deixa para trás?', array['pegadas', 'pegada']::text[]),
  (36, 'O que é, o que é: é cheia de buracos mas segura água?', array['esponja']::text[]),
  (37, 'O que é, o que é: vai e vem no parquinho sem sair do lugar?', array['balanço']::text[]),
  (38, 'O que é, o que é: tem uma perna só e dança sem parar?', array['pião']::text[]),
  (39, 'O que é, o que é: tem cabelo por fora, água por dentro e cai do coqueiro?', array['coco']::text[]),
  (40, 'O que é, o que é: quanto mais se enche, mais leve fica e sobe?', array['balão']::text[]),
  (41, 'O que é, o que é: tem cara e coroa mas não é rei?', array['moeda']::text[]),
  (42, 'O que é, o que é: tem asas de metal e leva gente pelo céu?', array['avião']::text[]),
  (43, 'O que é, o que é: anda com a casa nas costas e deixa um rastro brilhante?', array['caracol', 'lesma']::text[]),
  (44, 'O que é, o que é: é feito de água, mas se colocar na água ele some?', array['gelo']::text[]),
  (45, 'O que é, o que é: dá a volta no pasto inteiro sem sair do lugar?', array['cerca']::text[]),
  (46, 'O que é, o que é: come tudo que lhe dão, mas se beber água morre?', array['fogo']::text[]),
  (47, 'O que é, o que é: tem pés e cabeceira, mas não anda nem pensa?', array['cama']::text[]),
  (48, 'O que é, o que é: passa a vida na casa (da camisa) e mesmo assim fica do lado de fora?', array['botão']::text[]),
  (49, 'O que é, o que é: voa sem asas e chora sem olhos?', array['nuvem']::text[]),
  (50, 'O que é, o que é: é verde, fala, mas não é gente?', array['papagaio']::text[]),
  (51, 'O que é, o que é: tem cabeça, não pensa, e vive levando martelada?', array['prego']::text[]),
  (52, 'O que é, o que é: risca o céu na tempestade e ninguém consegue apagar?', array['relâmpago', 'raio']::text[]),
  (53, 'O que é, o que é: pequeno como um rato, guarda a casa como um leão?', array['cadeado']::text[]),
  (54, 'O que é, o que é: quanto mais você corre em cima dela, menos sai do lugar?', array['esteira']::text[]),
  (55, 'O que é, o que é: tem listras amarelas, zumbe e faz mel?', array['abelha']::text[]),
  (56, 'O que é, o que é: anda de quatro de manhã, com dois pés à tarde e com três à noite?', array['homem', 'ser humano', 'pessoa']::text[]),
  (57, 'O que é, o que é: cai do céu branquinho e derrete na mão?', array['neve']::text[]),
  (58, 'O que é, o que é: tem bolsa na barriga e pula pela Austrália?', array['canguru']::text[]),
  (59, 'O que é, o que é: parece um cavalo de pijama listrado?', array['zebra']::text[]),
  (60, 'O que é, o que é: tem tromba mas não é elefante, voa e pica?', array['mosquito', 'pernilongo']::text[]),
  (61, 'O que é, o que é: tem luz mas não é lâmpada, e pisca voando à noite?', array['vaga-lume', 'vagalume', 'pirilampo']::text[]),
  (62, 'O que é, o que é: só pode ser usado depois de quebrado?', array['ovo']::text[]),
  (63, 'O que é, o que é: tem dentes, não mastiga, e fecha a jaqueta?', array['zíper', 'fecho']::text[]),
  (64, 'O que é, o que é: grita no céu sem ter boca?', array['trovão']::text[]),
  (65, 'O que é, o que é: tem páginas, sai todo dia e fica velho no dia seguinte?', array['jornal']::text[]),
  (66, 'O que é, o que é: mora no mar e tem oito braços?', array['polvo']::text[]),
  (67, 'O que é, o que é: é gelado, doce, vem na casquinha e derrete no sol?', array['sorvete']::text[]),
  (68, 'O que é, o que é: anda de lado e tem duas pinças?', array['caranguejo', 'siri']::text[]),
  (69, 'O que é, o que é: tem vagões, anda sobre trilhos e apita?', array['trem']::text[]),
  (70, 'O que é, o que é: tem duas rodas, pedais e guidão?', array['bicicleta']::text[]),
  (71, 'O que é, o que é: mostra tudo o que você faz, mas não conta para ninguém?', array['espelho']::text[]),
  (72, 'O que é, o que é: acorda todo mundo cedo e canta no quintal?', array['galo']::text[]),
  (73, 'O que é, o que é: é redonda, todos chutam e ela vai para o gol?', array['bola']::text[]),
  (74, 'O que é, o que é: gira, gira, e deixa o quarto fresquinho?', array['ventilador']::text[]),
  (75, 'O que é, o que é: sai dos olhos quando a gente chora?', array['lágrima']::text[]),
  (76, 'O que é, o que é: dorme de cabeça para baixo e voa à noite?', array['morcego']::text[]),
  (77, 'O que é, o que é: come papel, casca e resto, e nunca fica satisfeita?', array['lixeira', 'lixo']::text[]),
  (78, 'O que é, o que é: tem sete cores e aparece depois da chuva?', array['arco-íris']::text[]),
  (79, 'O que é, o que é: troca de pele e anda rastejando?', array['cobra', 'serpente']::text[]),
  (80, 'O que é, o que é: tem espinhos, vive no deserto e guarda água?', array['cacto']::text[]),
  (81, 'O que é, o que é: vive na parede e caça mosquito?', array['lagartixa']::text[]),
  (82, 'O que é, o que é: tem doze meses e você pendura na parede?', array['calendário']::text[]),
  (83, 'O que é, o que é: tem teclas, tela e cabe no bolso?', array['celular', 'telefone']::text[]),
  (84, 'O que é, o que é: tem casca, gomos e vira suco de manhã?', array['laranja']::text[]),
  (85, 'O que é, o que é: tem tronco mas não é gente, tem copa mas não é cozinha?', array['árvore']::text[]),
  (86, 'O que é, o que é: quando fica velha a gente troca, e ela ilumina o quarto?', array['lâmpada']::text[]),
  (87, 'O que é, o que é: tem ponte, tem pedal, e a gente toca com as mãos?', array['violão', 'piano']::text[]),
  (88, 'O que é, o que é: tem barriga, não come, e faz chá apitando?', array['chaleira']::text[]),
  (89, 'O que é, o que é: tem juba e é o rei da selva?', array['leão']::text[]),
  (90, 'O que é, o que é: é branco, a vaca dá e a gente põe no café?', array['leite']::text[]),
  (91, 'O que é, o que é: tem cabo, tem cerdas e limpa o chão?', array['vassoura']::text[]),
  (92, 'O que é, o que é: sobe e desce o prédio sem usar degraus?', array['elevador']::text[])
on conflict (id) do update set question = excluded.question, answers = excluded.answers;
