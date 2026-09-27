import type { Projection } from '@/lib/engine';
import type { Character, GameState, Riddle } from '@/lib/engine';
import type { Tx } from './db';
import { json } from './db';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function loadState(tx: Tx, roomId: string): Promise<GameState> {
  const rows = await tx<{ state: GameState }[]>`select state from game_private.game_state where room_id = ${roomId}`;
  if (!rows.length) throw new Error('Estado da partida não encontrado.');
  return rows[0].state;
}

export async function saveState(tx: Tx, roomId: string, state: GameState): Promise<void> {
  await tx`
    insert into game_private.game_state (room_id, state, updated_at)
    values (${roomId}, ${json(tx, state)}, now())
    on conflict (room_id) do update set state = excluded.state, updated_at = now()`;
}

export async function loadRiddles(tx: Tx): Promise<Riddle[]> {
  return tx<Riddle[]>`select id, question, answers from game_private.riddles order by id`;
}

export async function loadCharacters(tx: Tx): Promise<Character[]> {
  const rows = await tx<
    {
      id: string;
      name: string;
      birth: string;
      country: string;
      gender: Character['gender'];
      origin: Character['origin'];
      century: Character['century'];
      area: string;
      weapon: string;
      aliases: string[];
      weapon_aliases: string[];
    }[]
  >`select id, name, to_char(birth, 'YYYY-MM-DD') as birth, country, gender, origin, century, area, weapon, aliases, weapon_aliases
    from game_private.characters order by id`;
  return rows.map((r) => ({ ...r, weaponAliases: r.weapon_aliases }));
}

/**
 * Grava no banco apenas o que mudou entre duas projeções.
 * Cada tabela recebe no máximo um comando (via jsonb_to_recordset).
 */
export async function persistProjection(tx: Tx, roomId: string, before: Projection | null, after: Projection): Promise<void> {
  // Jogadores (número e status)
  const players = Object.entries(after.players)
    .filter(([id, v]) => !before || !same(before.players[id], v))
    .map(([id, v]) => ({ id, seat: v.seat, status: v.status }));
  if (players.length) {
    await tx`
      update public.players p set seat = x.seat, status = x.status
      from jsonb_to_recordset(${json(tx, players)}) as x(id uuid, seat int, status text)
      where p.id = x.id and p.room_id = ${roomId}`;
  }

  // Segredos
  const secrets = Object.entries(after.secrets)
    .filter(([id, v]) => !before || !same(before.secrets[id], v))
    .map(([id, v]) => ({ player_id: id, role: v.role, role_label: v.roleLabel, character_name: v.characterName, data: v.data }));
  if (secrets.length) {
    await tx`
      insert into public.player_secrets (player_id, room_id, role, role_label, character_name, data, updated_at)
      select x.player_id, ${roomId}, x.role, x.role_label, x.character_name, x.data, now()
      from jsonb_to_recordset(${json(tx, secrets)})
        as x(player_id uuid, role text, role_label text, character_name text, data jsonb)
      on conflict (player_id) do update set
        role = excluded.role, role_label = excluded.role_label, character_name = excluded.character_name,
        data = excluded.data, updated_at = now()`;
  }

  // Cards
  const cards = Object.entries(after.cards).flatMap(([id, list]) =>
    list
      .filter((c) => {
        const prev = before?.cards[id]?.find((b) => b.slot === c.slot);
        return !prev || !same(prev, c);
      })
      .map((c) => ({ player_id: id, ...c })),
  );
  if (cards.length) {
    await tx`
      insert into public.player_cards (player_id, slot, room_id, round, step, title, prompt, fields, status, feedback, updated_at)
      select x.player_id, x.slot, ${roomId}, x.round, x.step, x.title, x.prompt, x.fields, x.status, x.feedback, now()
      from jsonb_to_recordset(${json(tx, cards)})
        as x(player_id uuid, slot int, round int, step int, title text, prompt text, fields text, status text, feedback text)
      on conflict (player_id, slot) do update set
        round = excluded.round, step = excluded.step, title = excluded.title, prompt = excluded.prompt,
        fields = excluded.fields, status = excluded.status, feedback = excluded.feedback, updated_at = now()`;
  }

  // Resultados privados (só acrescenta)
  const results = Object.entries(after.results).flatMap(([id, list]) =>
    list.slice(before?.results[id]?.length ?? 0).map((r, i) => ({
      player_id: id,
      idx: (before?.results[id]?.length ?? 0) + i,
      round: r.round,
      kind: r.kind,
      text: r.text,
    })),
  );
  if (results.length) {
    await tx`
      insert into public.player_results (player_id, idx, room_id, round, kind, text)
      select x.player_id, x.idx, ${roomId}, x.round, x.kind, x.text
      from jsonb_to_recordset(${json(tx, results)})
        as x(player_id uuid, idx int, round int, kind text, text text)
      on conflict (player_id, idx) do nothing`;
  }

  // Equipes
  if (!before) {
    const members = (['killers', 'investigators'] as const).flatMap((team) =>
      after.teams[team].members.map((player_id) => ({ team, player_id })),
    );
    await tx`
      insert into public.team_members (room_id, team, player_id)
      select ${roomId}, x.team, x.player_id
      from jsonb_to_recordset(${json(tx, members)}) as x(team text, player_id uuid)
      on conflict do nothing`;
  }
  for (const team of ['killers', 'investigators'] as const) {
    if (before && same(before.teams[team].data, after.teams[team].data)) continue;
    await tx`
      insert into public.team_state (room_id, team, data, updated_at)
      values (${roomId}, ${team}, ${json(tx, after.teams[team].data)}, now())
      on conflict (room_id, team) do update set data = excluded.data, updated_at = now()`;
  }

  // Anúncios (só acrescenta)
  const newAnnouncements = after.announcements.slice(before?.announcements.length ?? 0);
  if (newAnnouncements.length) {
    const rows = newAnnouncements.map((a) => ({
      round: a.round,
      player_id: a.playerId,
      kind: a.kind,
      name: a.name,
      seat: a.seat,
      character_name: a.characterName,
    }));
    await tx`
      insert into public.announcements (room_id, round, player_id, kind, name, seat, character_name)
      select ${roomId}, x.round, x.player_id, x.kind, x.name, x.seat, x.character_name
      from jsonb_to_recordset(${json(tx, rows)})
        as x(round int, player_id uuid, kind text, name text, seat int, character_name text)
      on conflict do nothing`;
  }

  // Revelação final
  if (after.reveal && !before?.reveal) {
    const rows = after.reveal.map((r) => ({
      player_id: r.playerId,
      name: r.name,
      seat: r.seat,
      role: r.role,
      role_label: r.roleLabel,
      character_name: r.characterName,
      status: r.status,
    }));
    await tx`
      insert into public.final_reveal (room_id, player_id, name, seat, role, role_label, character_name, status)
      select ${roomId}, x.player_id, x.name, x.seat, x.role, x.role_label, x.character_name, x.status
      from jsonb_to_recordset(${json(tx, rows)})
        as x(player_id uuid, name text, seat int, role text, role_label text, character_name text, status text)
      on conflict do nothing`;
  }
}
