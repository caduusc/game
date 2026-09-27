import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  computeActingHost,
  cryptoRng,
  endGame,
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  project,
  resolveRound,
  setupGame,
  submitCard,
  type GameState,
} from '@/lib/engine';
import { db, json, type Tx } from './db';
import { HttpError } from './errors';
import { loadCharacters, loadRiddles, loadState, persistProjection, saveState } from './persist';

// ------------------------------------------------------------------ tipos

export interface RoomRow {
  id: string;
  code: string;
  host_player_id: string | null;
  acting_host_player_id: string | null;
  status: 'lobby' | 'playing' | 'finished';
  round_minutes: number;
  current_round: number;
  ends_at: Date | null;
  paused_remaining_ms: number | null;
  resolved_round: number;
  winner: string | null;
  dev_mode: boolean;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string | null;
  name: string;
  seat: number | null;
  status: 'alive' | 'dead' | 'arrested';
  is_bot: boolean;
  joined_at: Date;
  last_seen_at: Date | null;
}

type Body = Record<string, unknown>;

/** Janela de tolerância de rede para ações logo após o fim do tempo. */
const ACTION_GRACE_MS = 1000;
const REJOIN_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const REJOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// ------------------------------------------------------------------ utilidades

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
}

function normalizeCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(c)) throw new HttpError(404, 'Sala não encontrada.');
  return c;
}

function randomCode(alphabet: string, len: number): string {
  return Array.from({ length: len }, () => alphabet[randomInt(alphabet.length)]).join('');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

async function lockRoom(tx: Tx, code: string): Promise<RoomRow> {
  const rows = await tx<RoomRow[]>`select * from public.rooms where code = ${normalizeCode(code)} for update`;
  if (!rows.length) throw new HttpError(404, 'Sala não encontrada.');
  return rows[0];
}

async function roomPlayers(tx: Tx, roomId: string): Promise<PlayerRow[]> {
  return tx<PlayerRow[]>`select * from public.players where room_id = ${roomId} order by seat nulls last, joined_at`;
}

function findMe(players: PlayerRow[], userId: string): PlayerRow {
  const me = players.find((p) => p.user_id === userId);
  if (!me) throw new HttpError(403, 'Você não está nesta sala.');
  return me;
}

async function refreshActingHost(tx: Tx, room: RoomRow, players: PlayerRow[], now: number): Promise<string> {
  const acting = computeActingHost(
    {
      hostId: room.host_player_id ?? players[0]?.id,
      currentActingId: room.acting_host_player_id,
      inLobby: room.status === 'lobby',
      players: players.map((p) => ({
        id: p.id,
        seat: p.seat,
        status: p.status,
        isBot: p.is_bot,
        joinedAt: p.joined_at.getTime(),
        lastSeenAt: p.last_seen_at ? p.last_seen_at.getTime() : null,
      })),
    },
    now,
  );
  if (acting !== room.acting_host_player_id) {
    await tx`update public.rooms set acting_host_player_id = ${acting} where id = ${room.id}`;
    room.acting_host_player_id = acting;
  }
  return acting;
}

async function requireHost(tx: Tx, room: RoomRow, players: PlayerRow[], userId: string, now: number): Promise<PlayerRow> {
  const me = findMe(players, userId);
  // O próprio pedido conta como sinal de presença.
  me.last_seen_at = new Date(now);
  await tx`update public.players set last_seen_at = ${me.last_seen_at} where id = ${me.id}`;
  const acting = await refreshActingHost(tx, room, players, now);
  if (acting !== me.id) throw new HttpError(403, 'Apenas o host pode fazer isso.');
  return me;
}

function isPlayingNow(room: RoomRow, now: number): boolean {
  return room.status === 'playing' && room.ends_at !== null && now <= room.ends_at.getTime() + ACTION_GRACE_MS;
}

async function applyStateToRoom(tx: Tx, room: RoomRow, state: GameState, now: number): Promise<void> {
  const finished = state.status === 'finished';
  const endsAt = finished ? null : new Date(now + room.round_minutes * 60_000);
  await tx`
    update public.rooms set
      status = ${finished ? 'finished' : 'playing'},
      current_round = ${state.round},
      resolved_round = ${finished ? state.round : state.round - 1},
      ends_at = ${endsAt},
      paused_remaining_ms = null,
      winner = ${state.winner}
    where id = ${room.id}`;
}

function ok(body: Body = {}): Body {
  return { ok: true, serverNow: Date.now(), ...body };
}

// ------------------------------------------------------------------ sala

const createSchema = z.object({
  name: z.string().trim().min(1, 'Digite seu nome.').max(24, 'Nome muito longo.'),
  roundMinutes: z.coerce.number().int().min(1).max(30).default(5),
  devMode: z.boolean().optional().default(false),
});

export async function createRoom(userId: string, body: unknown): Promise<Body> {
  const input = parse(createSchema, body);
  const devMode = input.devMode && devToolsEnabled();
  return db().begin(async (tx) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode(CODE_ALPHABET, 4);
      const inserted = await tx<{ id: string }[]>`
        insert into public.rooms (code, round_minutes, dev_mode)
        values (${code}, ${input.roundMinutes}, ${devMode})
        on conflict (code) do nothing
        returning id`;
      if (!inserted.length) continue;
      const roomId = inserted[0].id;
      const [player] = await tx<{ id: string }[]>`
        insert into public.players (room_id, user_id, name, last_seen_at)
        values (${roomId}, ${userId}, ${input.name}, now())
        returning id`;
      await tx`update public.rooms set host_player_id = ${player.id}, acting_host_player_id = ${player.id} where id = ${roomId}`;
      return ok({ code, roomId, playerId: player.id });
    }
    throw new HttpError(503, 'Não foi possível gerar um código de sala. Tente de novo.');
  });
}

const joinSchema = z.object({ name: z.string().trim().min(1, 'Digite seu nome.').max(24, 'Nome muito longo.') });

export async function joinRoom(userId: string, code: string, body: unknown): Promise<Body> {
  const { name } = parse(joinSchema, body);
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    const existing = players.find((p) => p.user_id === userId);
    if (existing) return ok({ code: room.code, roomId: room.id, playerId: existing.id });
    if (room.status !== 'lobby') {
      throw new HttpError(409, 'A partida já começou. Peça ao host um código de reentrada se você já estava jogando.');
    }
    if (players.length >= MAX_PLAYERS) throw new HttpError(409, `A sala está cheia (${MAX_PLAYERS} jogadores).`);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'Já existe alguém com esse nome na sala.');
    }
    const [player] = await tx<{ id: string }[]>`
      insert into public.players (room_id, user_id, name, last_seen_at)
      values (${room.id}, ${userId}, ${name}, now())
      returning id`;
    return ok({ code: room.code, roomId: room.id, playerId: player.id });
  });
}

const rejoinSchema = z.object({ rejoinCode: z.string().trim().min(4, 'Digite o código de reentrada.').max(12) });

export async function rejoinRoom(userId: string, code: string, body: unknown): Promise<Body> {
  const { rejoinCode } = parse(rejoinSchema, body);
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const rows = await tx<{ id: string; player_id: string }[]>`
      select id, player_id from game_private.rejoin_codes
      where room_id = ${room.id} and code_hash = ${hashCode(rejoinCode)}
        and used_at is null and expires_at > now()
      for update`;
    if (!rows.length) throw new HttpError(400, 'Código de reentrada inválido ou expirado.');
    const { id, player_id } = rows[0];
    const players = await roomPlayers(tx, room.id);
    const current = players.find((p) => p.user_id === userId);
    if (current && current.id !== player_id) {
      throw new HttpError(409, 'Este navegador já ocupa outro lugar nesta sala.');
    }
    await tx`update public.players set user_id = ${userId}, last_seen_at = now() where id = ${player_id}`;
    await tx`update game_private.rejoin_codes set used_at = now() where id = ${id}`;
    await tx`update game_private.rejoin_codes set used_at = now() where player_id = ${player_id} and used_at is null`;
    return ok({ code: room.code, roomId: room.id, playerId: player_id });
  });
}

const rejoinCodeSchema = z.object({ playerId: z.string().uuid() });

export async function createRejoinCode(userId: string, code: string, body: unknown): Promise<Body> {
  const { playerId } = parse(rejoinCodeSchema, body);
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    await requireHost(tx, room, players, userId, now);
    const target = players.find((p) => p.id === playerId);
    if (!target) throw new HttpError(404, 'Jogador não encontrado.');
    if (target.is_bot) throw new HttpError(400, 'Bots não precisam de reentrada.');
    const rejoin = randomCode(REJOIN_ALPHABET, 6);
    const expiresAt = new Date(now + REJOIN_TTL_MS);
    await tx`update game_private.rejoin_codes set used_at = now() where player_id = ${playerId} and used_at is null`;
    await tx`
      insert into game_private.rejoin_codes (room_id, player_id, code_hash, expires_at)
      values (${room.id}, ${playerId}, ${hashCode(rejoin)}, ${expiresAt})`;
    return ok({ rejoinCode: rejoin, expiresAt: expiresAt.getTime(), playerName: target.name });
  });
}

export async function heartbeat(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  const sql = db();
  // Sem trava na sala: presença é frequente e não mexe no jogo.
  const rooms = await sql<RoomRow[]>`select * from public.rooms where code = ${normalizeCode(code)}`;
  if (!rooms.length) throw new HttpError(404, 'Sala não encontrada.');
  const room = rooms[0];
  const players = await sql<PlayerRow[]>`select * from public.players where room_id = ${room.id}`;
  const me = findMe(players, userId);
  me.last_seen_at = new Date(now);
  await sql`update public.players set last_seen_at = ${me.last_seen_at} where id = ${me.id}`;
  const acting = computeActingHost(
    {
      hostId: room.host_player_id ?? me.id,
      currentActingId: room.acting_host_player_id,
      inLobby: room.status === 'lobby',
      players: players.map((p) => ({
        id: p.id,
        seat: p.seat,
        status: p.status,
        isBot: p.is_bot,
        joinedAt: p.joined_at.getTime(),
        lastSeenAt: p.last_seen_at ? p.last_seen_at.getTime() : null,
      })),
    },
    now,
  );
  if (acting !== room.acting_host_player_id) {
    await sql`
      update public.rooms set acting_host_player_id = ${acting}
      where id = ${room.id} and acting_host_player_id is distinct from ${acting}`;
  }
  return ok({
    roomId: room.id,
    playerId: me.id,
    isOriginalHost: room.host_player_id === me.id,
    actingHostId: acting,
    devTools: devToolsEnabled() && room.dev_mode,
  });
}

// ------------------------------------------------------------------ controles do host

export async function startGame(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    await requireHost(tx, room, players, userId, now);
    if (room.status !== 'lobby') throw new HttpError(409, 'A partida já começou.');
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new HttpError(400, `São necessários de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores (agora: ${players.length}).`);
    }
    const [characters, riddles] = await Promise.all([loadCharacters(tx), loadRiddles(tx)]);
    const state = setupGame(
      { players: players.map((p) => ({ id: p.id, name: p.name })), characters },
      { rng: cryptoRng(), riddles },
    );
    await saveState(tx, room.id, state);
    await persistProjection(tx, room.id, null, project(state));
    await applyStateToRoom(tx, room, state, now);
    return ok();
  });
}

export async function pauseGame(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    await requireHost(tx, room, players, userId, now);
    if (room.status !== 'playing' || !room.ends_at) throw new HttpError(409, 'Nada para pausar.');
    const remaining = Math.max(0, room.ends_at.getTime() - now);
    await tx`update public.rooms set ends_at = null, paused_remaining_ms = ${remaining} where id = ${room.id}`;
    return ok();
  });
}

export async function resumeGame(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    await requireHost(tx, room, players, userId, now);
    if (room.status !== 'playing' || room.paused_remaining_ms === null) throw new HttpError(409, 'A partida não está pausada.');
    await tx`
      update public.rooms set ends_at = ${new Date(now + room.paused_remaining_ms)}, paused_remaining_ms = null
      where id = ${room.id}`;
    return ok();
  });
}

export async function endRoom(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    await requireHost(tx, room, players, userId, now);
    if (room.status === 'finished') return ok();
    if (room.status === 'lobby') {
      await tx`update public.rooms set status = 'finished', winner = 'none' where id = ${room.id}`;
      return ok();
    }
    const state = await loadState(tx, room.id);
    const next = endGame(state);
    await saveState(tx, room.id, next);
    await persistProjection(tx, room.id, project(state), project(next));
    await applyStateToRoom(tx, room, next, now);
    return ok();
  });
}

// ------------------------------------------------------------------ virada de rodada

async function resolveIfDue(tx: Tx, room: RoomRow, now: number): Promise<boolean> {
  if (room.status !== 'playing') return false;
  if (room.paused_remaining_ms !== null || !room.ends_at) return false;
  if (now < room.ends_at.getTime()) return false;
  if (room.resolved_round >= room.current_round) return false;
  const state = await loadState(tx, room.id);
  if (state.round !== room.current_round || state.status !== 'playing') return false;
  const riddles = await loadRiddles(tx);
  const { state: next } = resolveRound(state, { rng: cryptoRng(), riddles });
  await saveState(tx, room.id, next);
  await persistProjection(tx, room.id, project(state), project(next));
  await applyStateToRoom(tx, room, next, now);
  return true;
}

/** Idempotente: só resolve se o tempo acabou e a rodada ainda não foi resolvida. */
export async function tick(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    findMe(await roomPlayers(tx, room.id), userId);
    const resolved = await resolveIfDue(tx, room, now);
    return ok({ resolved });
  });
}

// ------------------------------------------------------------------ ações

const actionSchema = z.object({
  slot: z.coerce.number().int().min(1).max(3),
  number: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : NaN;
    }),
  text: z.string().max(200, 'Resposta muito longa.').nullish(),
  actAs: z.string().uuid().nullish(),
});

export async function submitAction(userId: string, code: string, body: unknown): Promise<Body> {
  const input = parse(actionSchema, body);
  if (Number.isNaN(input.number)) throw new HttpError(400, 'Número inválido.');
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    const me = findMe(players, userId);
    let actor = me;
    if (input.actAs && input.actAs !== me.id) {
      const target = players.find((p) => p.id === input.actAs);
      if (!devToolsEnabled() || !room.dev_mode || room.host_player_id !== me.id || !target?.is_bot) {
        throw new HttpError(403, 'Ação não permitida.');
      }
      actor = target;
    }
    if (room.status !== 'playing') throw new HttpError(409, 'A partida não está em andamento.');
    if (room.paused_remaining_ms !== null) throw new HttpError(409, 'A partida está pausada.');
    if (!isPlayingNow(room, now)) throw new HttpError(409, 'O tempo da rodada acabou.');

    const state = await loadState(tx, room.id);
    const before = project(state);
    let feedback: string;
    try {
      feedback = submitCard(state, actor.id, input.slot, { number: input.number, text: input.text ?? null }, {
        rng: cryptoRng(),
        riddles: [],
      });
    } catch (e) {
      if (e instanceof GameError) throw new HttpError(400, e.message);
      throw e;
    }
    await saveState(tx, room.id, state);
    await persistProjection(tx, room.id, before, project(state));
    await tx`
      insert into game_private.actions (room_id, round, player_id, slot, payload, feedback)
      values (${room.id}, ${state.round}, ${actor.id}, ${input.slot},
              ${json(tx, { number: input.number, text: input.text ?? null })}, ${feedback})`;
    return ok({ feedback });
  });
}

// ------------------------------------------------------------------ modo dev

function requireDev(room: RoomRow, me: PlayerRow) {
  if (!devToolsEnabled() || !room.dev_mode) throw new HttpError(403, 'Modo de teste desativado.');
  if (room.host_player_id !== me.id) throw new HttpError(403, 'Apenas o host original usa o modo de teste.');
}

const botsSchema = z.object({ count: z.coerce.number().int().min(1).max(MAX_PLAYERS).default(1) });

export async function devAddBots(userId: string, code: string, body: unknown): Promise<Body> {
  const { count } = parse(botsSchema, body);
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    const players = await roomPlayers(tx, room.id);
    requireDev(room, findMe(players, userId));
    if (room.status !== 'lobby') throw new HttpError(409, 'Bots só podem entrar no lobby.');
    const free = MAX_PLAYERS - players.length;
    const names = new Set(players.map((p) => p.name.toLowerCase()));
    let n = 1;
    const toAdd: string[] = [];
    while (toAdd.length < Math.min(count, free)) {
      const name = `Bot ${n++}`;
      if (!names.has(name.toLowerCase())) toAdd.push(name);
    }
    for (const name of toAdd) {
      await tx`insert into public.players (room_id, name, is_bot) values (${room.id}, ${name}, true)`;
    }
    return ok({ added: toAdd.length });
  });
}

const viewSchema = z.object({ playerId: z.string().uuid() });

/** Retorna, para um bot, as mesmas linhas que o RLS entregaria ao dono do lugar. */
export async function devView(userId: string, code: string, body: unknown): Promise<Body> {
  const { playerId } = parse(viewSchema, body);
  const sql = db();
  const rooms = await sql<RoomRow[]>`select * from public.rooms where code = ${normalizeCode(code)}`;
  if (!rooms.length) throw new HttpError(404, 'Sala não encontrada.');
  const room = rooms[0];
  const players = await sql<PlayerRow[]>`select * from public.players where room_id = ${room.id}`;
  const me = findMe(players, userId);
  requireDev(room, me);
  const target = players.find((p) => p.id === playerId);
  if (!target || (!target.is_bot && target.id !== me.id)) throw new HttpError(403, 'Só é possível visualizar bots.');
  const [secret] = await sql`select * from public.player_secrets where player_id = ${playerId}`;
  const cards = await sql`select * from public.player_cards where player_id = ${playerId} order by slot`;
  const results = await sql`select * from public.player_results where player_id = ${playerId} order by idx`;
  const teams = await sql`
    select ts.* from public.team_state ts
    join public.team_members tm on tm.room_id = ts.room_id and tm.team = ts.team
    where ts.room_id = ${room.id} and tm.player_id = ${playerId}`;
  return ok({ secret: secret ?? null, cards, results, teams });
}

export async function devForceEnd(userId: string, code: string): Promise<Body> {
  const now = Date.now();
  return db().begin(async (tx) => {
    const room = await lockRoom(tx, code);
    requireDev(room, findMe(await roomPlayers(tx, room.id), userId));
    if (room.status !== 'playing') throw new HttpError(409, 'A partida não está em andamento.');
    room.ends_at = new Date(now - 1);
    room.paused_remaining_ms = null;
    await tx`update public.rooms set ends_at = ${room.ends_at}, paused_remaining_ms = null where id = ${room.id}`;
    const resolved = await resolveIfDue(tx, room, now);
    return ok({ resolved });
  });
}

// ------------------------------------------------------------------ roteamento

export const ROOM_OPS: Record<string, (userId: string, code: string, body: unknown) => Promise<Body>> = {
  join: joinRoom,
  rejoin: rejoinRoom,
  heartbeat: (u, c) => heartbeat(u, c),
  start: (u, c) => startGame(u, c),
  pause: (u, c) => pauseGame(u, c),
  resume: (u, c) => resumeGame(u, c),
  end: (u, c) => endRoom(u, c),
  tick: (u, c) => tick(u, c),
  action: submitAction,
  'rejoin-code': createRejoinCode,
  'dev-bots': devAddBots,
  'dev-view': devView,
  'dev-force-end': (u, c) => devForceEnd(u, c),
};
