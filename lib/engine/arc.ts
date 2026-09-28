import type { Arc, GamePlayer, GameState, Side } from './types';

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
 * Candidatos fora do arco a partir de uma ponta: L (anti-horário a partir de L)
 * ou R (horário a partir de R), pulando quem não está vivo e os já tomados.
 */
export function walkSide(
  arc: Arc,
  n: number,
  side: Side,
  isFree: (seat: number) => boolean,
  count = 1,
): number[] {
  const step = side === 'L' ? ccw : cw;
  const out: number[] = [];
  let s = step(side === 'L' ? arc.l : arc.r, n);
  for (let i = 0; i < n && out.length < count; i++, s = step(s, n)) {
    if (inArc(arc, s, n)) break;
    if (isFree(s)) out.push(s);
  }
  return out;
}

/** Estende o arco para cobrir um assento marcado, pelo lado indicado (ou o mais próximo). */
export function extendArc(arc: Arc | null, seat: number, side: Side | null, n: number): Arc {
  if (!arc) return { l: seat, r: seat };
  if (inArc(arc, seat, n)) return arc;
  const dl = (arc.l - seat + n) % n;
  const dr = (seat - arc.r + n) % n;
  const useLeft = side ? side === 'L' : dl <= dr;
  return useLeft ? { l: seat, r: arc.r } : { l: arc.l, r: seat };
}

export function aliveKillers(players: readonly GamePlayer[]): GamePlayer[] {
  return players
    .filter((p) => p.role === 'killer' && p.status === 'alive')
    .sort((a, b) => (a.killerSlot ?? 'Z').localeCompare(b.killerSlot ?? 'Z'));
}

function isAliveSeat(state: GameState, seat: number): boolean {
  return state.players.some((p) => p.seat === seat && p.status === 'alive');
}

/** Assentos que já estão com algum assassino (ataques em andamento, reservados, congelados nesta rodada). */
function takenSeats(state: GameState): Set<number> {
  const taken = new Set<number>(state.attacks.map((a) => a.seat));
  for (const t of Object.values(state.killerTargets)) if (t) taken.add(t.seat);
  for (const p of Object.values(state.killerPlans)) if (p.seat !== null) taken.add(p.seat);
  return taken;
}

export function firstCandidate(state: GameState, side: Side, taken: Set<number>): number | null {
  if (!state.arc) return null;
  const n = state.players.length;
  return walkSide(state.arc, n, side, (s) => isAliveSeat(state, s) && !taken.has(s))[0] ?? null;
}

/**
 * Alvo provisório de cada assassino nesta rodada.
 * Congelado (arma já escolhida) > alvo guardado > lado escolhido.
 * Com os dois no mesmo lado, o A fica com o mais próximo e o B com o seguinte.
 */
export function tentativeTargets(state: GameState): Record<string, { seat: number; side: Side | null }> {
  const out: Record<string, { seat: number; side: Side | null }> = {};
  const killers = aliveKillers(state.players);
  const taken = takenSeats(state);
  for (const k of killers) {
    const plan = state.killerPlans[k.id];
    const saved = state.killerTargets[k.id];
    if (plan?.seat != null) out[k.id] = { seat: plan.seat, side: plan.side };
    else if (saved) out[k.id] = { seat: saved.seat, side: saved.side };
  }
  for (const k of killers) {
    if (out[k.id]) continue;
    const plan = state.killerPlans[k.id];
    if (!plan?.side) continue;
    const seat = firstCandidate(state, plan.side, taken);
    if (seat !== null) {
      out[k.id] = { seat, side: plan.side };
      taken.add(seat);
    }
  }
  return out;
}

/** Para a tela "Esquerda ou direita?": qual número o assassino pegaria em cada lado agora. */
export function sideChoices(state: GameState, killerId: string): { side: Side; seat: number }[] {
  const out: { side: Side; seat: number }[] = [];
  for (const side of ['L', 'R'] as const) {
    const sim: GameState = {
      ...state,
      killerPlans: { ...state.killerPlans, [killerId]: { side, seat: null, done: false, summary: null } },
      killerTargets: { ...state.killerTargets, [killerId]: null },
    };
    const t = tentativeTargets(sim)[killerId];
    if (t) out.push({ side, seat: t.seat });
  }
  // Se os dois lados apontam para a mesma pessoa, basta uma opção.
  return out.length === 2 && out[0].seat === out[1].seat ? [out[0]] : out;
}

export const SIDE_LABEL: Record<Side, string> = { L: 'Esquerda', R: 'Direita' };
