import { matchWeapon } from './answers';
import { assignTargets, extendArc, targetOptions } from './arc';
import { characterOf, playerBySeat } from './cards';
import { pick } from './rng';
import { startRound } from './setup';
import type { Announcement, EngineContext, GamePlayer, GameState, Role, Target, Winner } from './types';

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
  targets: Target[];
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

  const killerKills = new Set<number>();
  const policeKills = new Set<number>();
  const arrests = new Set<number>();
  let targets: Target[] = [];

  // Assassinos
  if (round === 1) {
    let t = state.initialTarget;
    if (t === null || !alive(t)) {
      const pool = state.players.filter((p) => p.status === 'alive' && p.role !== 'killer');
      t = pick(ctx.rng, pool.length ? pool : state.players.filter((p) => p.status === 'alive')).seat;
    }
    state.initialTarget = t;
    killerKills.add(t);
  } else if (state.arc) {
    targets = state.choice ?? targetOptions(state)[0] ?? [];
    for (const { seat } of assignTargets(state, targets)) {
      const answer = state.weaponAnswers[String(seat)];
      const victim = playerBySeat(state, seat)!;
      if (answer && matchWeapon(answer.answer, characterOf(state, victim))) killerKills.add(seat);
    }
  }

  // Policiais
  for (const shot of state.policeShots) {
    if (shot.correct && alive(shot.seat)) policeKills.add(shot.seat);
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
      round,
      playerId: p.id,
      name: p.name,
      seat: p.seat,
      kind: dies ? 'death' : 'arrest',
      characterName: characterOf(state, p).name,
    });
  }
  state.announcements.push(...announcements);

  // Arco e alvos obrigatórios
  if (round === 1) {
    state.arc = { l: state.initialTarget!, r: state.initialTarget! };
    state.pending = [];
  } else if (state.arc) {
    state.arc = extendArc(state.arc, targets, n);
    const pending = [...state.pending, ...targets.map((t) => t.seat)];
    state.pending = [...new Set(pending)].filter(alive);
  }

  const outcome: RoundOutcome = {
    killedByKillers: [...killerKills].sort((a, b) => a - b),
    killedByPolice: [...policeKills].sort((a, b) => a - b),
    arrested: [...arrests].filter((s) => !killerKills.has(s) && !policeKills.has(s)).sort((a, b) => a - b),
    targets,
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
