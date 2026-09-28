import { matchWeapon } from './answers';
import { extendArc } from './arc';
import { characterOf, expireSabotages, playerById, playerBySeat } from './cards';
import { pick } from './rng';
import { startRound } from './setup';
import type { Announcement, EngineContext, GamePlayer, GameState, Role, Winner } from './types';

function countAlive(players: readonly GamePlayer[], roles: Role[]): number {
  return players.filter((p) => roles.includes(p.role) && p.status === 'alive').length;
}

/**
 * Condições de vitória, checadas depois de resolver a virada.
 * - Assassinos: todos os cidadãos mortos, ou todos os investigadores e policiais mortos,
 *   com pelo menos um assassino em jogo no início da virada (as ações dele valem mesmo
 *   que ele caia na mesma virada).
 * - Bem: nenhum assassino vivo (mortos ou presos).
 * - As duas ao mesmo tempo: assassinos vencem.
 */
export function checkVictory(before: readonly GamePlayer[], after: readonly GamePlayer[]): Winner | null {
  const killersBefore = countAlive(before, ['killer']);
  const killersAfter = countAlive(after, ['killer']);
  const citizens = countAlive(after, ['citizen']);
  const enforcers = countAlive(after, ['investigator', 'police']);
  const killersWin = killersBefore > 0 && (citizens === 0 || enforcers === 0);
  const goodWins = killersAfter === 0;
  if (killersWin) return 'killers';
  if (goodWins) return 'good';
  return null;
}

export interface RoundOutcome {
  killedByKillers: number[];
  killedByPolice: number[];
  arrested: number[];
  newAttacks: number;
}

/** Escolhe o alvo inicial: o acordo dos dois assassinos, ou sorteio. */
function initialTarget(state: GameState, ctx: EngineContext): number {
  const picks = Object.values(state.initialPicks);
  const agreed = picks.length > 0 && picks.every((p) => p !== null && p === picks[0]) ? picks[0] : null;
  const valid = agreed !== null && playerBySeat(state, agreed)?.status === 'alive' ? agreed : null;
  if (valid !== null) return valid;
  const pool = state.players.filter((p) => p.status === 'alive' && p.role !== 'killer');
  return pick(ctx.rng, pool.length ? pool : state.players.filter((p) => p.status === 'alive')).seat;
}

/**
 * Resolve todas as ações da rodada ao mesmo tempo, checa vitória e abre a
 * próxima rodada. Não muta `prev`.
 */
export function resolveRound(prev: GameState, ctx: EngineContext): { state: GameState; outcome: RoundOutcome } {
  const state: GameState = structuredClone(prev);
  const round = state.round;
  const n = state.players.length;
  const before = structuredClone(state.players);
  const alive = (seat: number) => playerBySeat(state, seat)?.status === 'alive';

  expireSabotages(state, ctx.now);

  // Rodada 1: o alvo inicial vira um ataque automático que resolve na virada 2 → 3.
  if (round === 1) {
    const t = initialTarget(state, ctx);
    state.arc = extendArc(null, t, null, n);
    state.attacks.push({
      id: state.nextAttackId++,
      killerId: null,
      seat: t,
      side: null,
      weapon: null,
      chosenRound: 1,
      resolvesAfterRound: 2,
      sabotagedFrom: null,
    });
  }

  const killerKills = new Set<number>();
  const policeKills = new Set<number>();
  const arrests = new Set<number>();
  const missed: { killerId: string; seat: number; side: GameState['attacks'][number]['side'] }[] = [];

  // Ataques dos assassinos que vencem nesta virada
  const due = state.attacks.filter((a) => a.resolvesAfterRound === round);
  state.attacks = state.attacks.filter((a) => a.resolvesAfterRound !== round);
  for (const a of due) {
    const victim = playerBySeat(state, a.seat);
    if (!victim || victim.status !== 'alive') continue;
    const hits = a.weapon === null || a.sabotagedFrom !== null || matchWeapon(a.weapon, characterOf(state, victim));
    if (hits) killerKills.add(a.seat);
    else if (a.killerId) missed.push({ killerId: a.killerId, seat: a.seat, side: a.side });
  }

  // Policiais: o tiro da rodada X mata na virada X → X+1
  for (const shot of state.policeShots) {
    if (alive(shot.seat)) policeKills.add(shot.seat);
  }

  // Acusações
  for (const acc of state.accusations) {
    if (acc.round !== round) continue;
    const target = playerBySeat(state, acc.seat);
    if (target && target.role === 'killer' && target.status === 'alive') arrests.add(acc.seat);
  }

  // Aplica tudo de uma vez
  const announcements: Announcement[] = [];
  const affected = new Set([...killerKills, ...policeKills, ...arrests]);
  for (const seat of [...affected].sort((a, b) => a - b)) {
    const p = playerBySeat(state, seat)!;
    if (p.status !== 'alive') continue;
    const dies = killerKills.has(seat) || policeKills.has(seat);
    p.status = dies ? 'dead' : 'arrested';
    if (dies && p.role === 'maniac' && !state.maniacWon.includes(p.id)) state.maniacWon.push(p.id);
    announcements.push({
      kind: dies ? 'death' : 'arrest',
      round,
      playerId: p.id,
      name: p.name,
      seat: p.seat,
      characterName: characterOf(state, p).name,
    });
  }

  // Sabotagens desta rodada
  for (const s of state.sabotages) {
    if (s.round !== round || s.announced) continue;
    s.announced = true;
    if (s.status === 'success') announcements.push({ kind: 'sabotage_ok', round, seat: s.bySeat });
    else if (s.status === 'failed') announcements.push({ kind: 'sabotage_fail', round });
  }

  // Novos alvos escolhidos nesta rodada (morrem daqui a duas viradas)
  const newAttacks = state.attacks.filter((a) => a.chosenRound === round).length;
  if (newAttacks > 0) announcements.push({ kind: 'targeted', round, count: newAttacks });
  state.announcements.push(...announcements);

  // Arma errada: o alvo vivo fica obrigatório para o mesmo assassino.
  for (const m of missed) {
    if (!alive(m.seat)) continue;
    const killer = state.players.find((p) => p.id === m.killerId);
    if (killer?.status === 'alive') state.killerTargets[m.killerId] = { seat: m.seat, side: m.side, kind: 'obligatory' };
  }
  // Alvos guardados de quem saiu do jogo, ou já mortos, são descartados.
  for (const [killerId, t] of Object.entries(state.killerTargets)) {
    if (!t) continue;
    if (playerById(state, killerId).status !== 'alive' || !alive(t.seat)) state.killerTargets[killerId] = null;
  }

  const outcome: RoundOutcome = {
    killedByKillers: [...killerKills].sort((a, b) => a - b),
    killedByPolice: [...policeKills].sort((a, b) => a - b),
    arrested: [...arrests].filter((s) => !killerKills.has(s) && !policeKills.has(s)).sort((a, b) => a - b),
    newAttacks,
  };

  const winner = checkVictory(before, state.players);
  if (winner) {
    finish(state, winner);
  } else {
    state.round = round + 1;
    startRound(state, ctx);
  }
  return { state, outcome };
}

export function finish(state: GameState, winner: Winner): void {
  state.status = 'finished';
  state.winner = winner;
  for (const p of state.players) state.cards[p.id] = [];
}

/** Encerramento manual pelo host. */
export function endGame(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.status !== 'finished') finish(state, 'none');
  return state;
}
