-- Alergia — regras v2 (alvo com atraso, lado/arma em lista, 2 tiros, sabotagem)
-- Pode ser executado mais de uma vez sem erro.

-- Partidas em andamento com o formato antigo não são compatíveis: encerra sem vencedor.
update public.rooms set status = 'finished', winner = 'none', ends_at = null
where status = 'playing'
  and exists (
    select 1 from game_private.game_state g
    where g.room_id = rooms.id and coalesce((g.state ->> 'version')::int, 1) < 2
  );

-- Sala aguardando uma resposta (sabotagem) para virar a rodada.
alter table public.rooms add column if not exists standby boolean not null default false;

-- Cards: listas de opções e botão secundário.
delete from public.player_cards where fields not in ('text', 'choice', 'choice_text');
alter table public.player_cards add column if not exists options jsonb;
alter table public.player_cards add column if not exists skip_label text;
alter table public.player_cards drop constraint if exists player_cards_fields_check;
alter table public.player_cards add constraint player_cards_fields_check
  check (fields in ('text', 'choice', 'choice_text'));

-- Anúncios: além de mortes e prisões, "alvo escolhido" e sabotagens (sem jogador).
alter table public.announcements add column if not exists idx integer;
alter table public.announcements add column if not exists count integer;
with numbered as (
  select ctid, row_number() over (partition by room_id order by round, seat) - 1 as rn
  from public.announcements where idx is null
)
update public.announcements a set idx = n.rn from numbered n where a.ctid = n.ctid;
alter table public.announcements alter column idx set not null;
alter table public.announcements drop constraint if exists announcements_pkey;
alter table public.announcements add constraint announcements_pkey primary key (room_id, idx);
alter table public.announcements
  alter column player_id drop not null,
  alter column name drop not null,
  alter column seat drop not null,
  alter column character_name drop not null;
alter table public.announcements drop constraint if exists announcements_kind_check;
alter table public.announcements add constraint announcements_kind_check
  check (kind in ('death', 'arrest', 'targeted', 'sabotage_ok', 'sabotage_fail'));

-- Perguntas de múltipla escolha (sabotagem). Oculta para o cliente.
create table if not exists game_private.quiz (
  id integer primary key,
  question text not null unique,
  options text[] not null check (cardinality(options) = 4),
  answer integer not null check (answer between 0 and 3)
);
alter table game_private.quiz enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on game_private.quiz from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on game_private.quiz from authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
