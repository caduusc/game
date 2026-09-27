import type { Arc, GamePlayer, GameState, Target } from './types';

/** Próximo assento no sentido horário (N → 1). */
export function cw(seat: number, n: number): number {
  return (seat % n) + 1;
}

/** Próximo assento no sentido anti-horário (1 → N). */
export function ccw(seat: number, n: number): number {
  return ((seat - 2 + n) % n) + 1;
}

/** O arco é o intervalo contíguo de L até R no sentido horário. */
export function inArc(arc: Arc, seat: number, n: number): boolean {
  const span = (arc.r - arc.l + n) % n;
  const d = (seat - arc.l + n) % n;
  return d <= span;
}

/**
 * Candidatos fora do arco: L1, L2 (anti-horário a partir de L) e
 * R1, R2 (horário a partir de R), pulando quem não está vivo.
 */
export function sideCandidates(
  arc: Arc,
  n: number,
  isAlive: (seat: number) => boolean,
  count = 2,
): { L: number[]; R: number[] } {
  const walk = (start: number, step: (s: number, n: number) => number): number[] => {
    const out: number[] = [];
    let s = step(start, n);
    for (let i = 0; i < n && out.length < count; i++, s = step(s, n)) {
      if (inArc(arc, s, n)) break;
      if (isAlive(s)) out.push(s);
    }
    return out;
  };
  return { L: walk(arc.l, ccw), R: walk(arc.r, cw) };
}

export function aliveKillers(players: readonly GamePlayer[]): GamePlayer[] {
  return players
    .filter((p) => p.role === 'killer' && p.status === 'alive')
    .sort((a, b) => (a.killerSlot ?? 'Z').localeCompare(b.killerSlot ?? 'Z'));
}

function seatAlive(state: GameState) {
  const bySeat = new Map(state.players.map((p) => [p.seat, p]));
  return (seat: number) => bySeat.get(seat)?.status === 'alive';
}

/**
 * Combinações de alvos disponíveis para os assassinos nesta rodada (rodada 2+).
 * A primeira opção é o padrão usado se ninguém escolher.
 */
export function targetOptions(state: GameState): Target[][] {
  const killers = aliveKillers(state.players);
  const slots = Math.min(killers.length, 2);
  if (slots === 0 || !state.arc) return [];
  const n = state.players.length;
  const alive = seatAlive(state);
  const pending: Target[] = state.pending.filter(alive).map((seat) => ({ seat, side: 'P' }));
  const { L, R } = sideCandidates(state.arc, n, alive);
  const l = (i: number): Target | undefined => (L[i] !== undefined ? { seat: L[i], side: 'L' } : undefined);
  const r = (i: number): Target | undefined => (R[i] !== undefined ? { seat: R[i], side: 'R' } : undefined);

  let raw: (Target | undefined)[][];
  if (slots === 2) {
    if (pending.length >= 2) raw = [[pending[0], pending[1]]];
    else if (pending.length === 1) raw = [[pending[0], l(0)], [pending[0], r(0)]];
    else raw = [[l(0), r(0)], [l(0), l(1)], [r(0), r(1)]];
  } else {
    if (pending.length >= 1) raw = pending.map((p) => [p]);
    else raw = [[l(0)], [r(0)]];
  }

  const seen = new Set<string>();
  const out: Target[][] = [];
  for (const opt of raw) {
    const clean: Target[] = [];
    for (const t of opt) {
      if (t && !clean.some((c) => c.seat === t.seat)) clean.push(t);
    }
    if (!clean.length) continue;
    const key = clean.map((t) => t.seat).sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Estende o arco para cobrir os alvos escolhidos (acertando ou errando). */
export function extendArc(arc: Arc, targets: readonly Target[], n: number): Arc {
  const next = { ...arc };
  const ccwDist = (t: number) => (arc.l - t + n) % n;
  const cwDist = (t: number) => (t - arc.r + n) % n;
  const left = targets.filter((t) => t.side === 'L' && !inArc(arc, t.seat, n));
  const right = targets.filter((t) => t.side === 'R' && !inArc(arc, t.seat, n));
  if (left.length) next.l = left.reduce((a, b) => (ccwDist(b.seat) > ccwDist(a.seat) ? b : a)).seat;
  if (right.length) next.r = right.reduce((a, b) => (cwDist(b.seat) > cwDist(a.seat) ? b : a)).seat;
  return next;
}

/** Distribui os alvos: alvo 1 → Assassino A, alvo 2 → Assassino B. Sozinho: ele fica com o único alvo. */
export function assignTargets(state: GameState, targets: readonly Target[]): { killerId: string; seat: number }[] {
  const killers = aliveKillers(state.players);
  return targets.slice(0, killers.length).map((t, i) => ({ killerId: killers[i].id, seat: t.seat }));
}

export function formatOption(opt: readonly Target[]): string {
  return opt.map((t) => t.seat).join(' e ');
}
