import { describe, expect, it } from 'vitest';
import { ccw, cw, extendArc, inArc, sideChoices, tentativeTargets, walkSide } from '../arc';
import type { GameState, Side } from '../types';
import { makeState, twentyRoles } from './helpers';

function plan(s: GameState, killerId: string, side: Side | null, seat: number | null = null) {
  s.killerPlans[killerId] = { side, seat, done: seat !== null, summary: null };
}

const seatOf = (s: GameState, id: string) => tentativeTargets(s)[id]?.seat;

describe('círculo', () => {
  it('N fica ao lado do 1', () => {
    expect(cw(20, 20)).toBe(1);
    expect(ccw(1, 20)).toBe(20);
    expect(cw(5, 20)).toBe(6);
  });

  it('arco com volta no círculo', () => {
    const arc = { l: 19, r: 2 };
    expect([19, 20, 1, 2].every((s) => inArc(arc, s, 20))).toBe(true);
    expect(inArc(arc, 3, 20)).toBe(false);
    expect(inArc(arc, 18, 20)).toBe(false);
  });

  it('caminha pelos lados pulando mortos e dando a volta', () => {
    const free = (s: number) => ![20, 1, 5].includes(s);
    expect(walkSide({ l: 2, r: 3 }, 20, 'L', free, 2)).toEqual([19, 18]);
    expect(walkSide({ l: 2, r: 3 }, 20, 'R', free, 2)).toEqual([4, 6]);
  });

  it('estende o arco pelo lado indicado', () => {
    expect(extendArc(null, 6, null, 20)).toEqual({ l: 6, r: 6 });
    expect(extendArc({ l: 6, r: 6 }, 4, 'L', 20)).toEqual({ l: 4, r: 6 });
    expect(extendArc({ l: 6, r: 6 }, 8, 'R', 20)).toEqual({ l: 6, r: 8 });
    expect(extendArc({ l: 1, r: 2 }, 20, 'L', 20)).toEqual({ l: 20, r: 2 });
    expect(extendArc({ l: 4, r: 6 }, 5, 'L', 20)).toEqual({ l: 4, r: 6 });
  });
});

describe('esquerda ou direita (alvo inicial 6)', () => {
  const base = () => makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });

  it('os dois na esquerda: 5 e 4 (A com o mais próximo)', () => {
    const s = base();
    plan(s, 'p10', 'L');
    plan(s, 'p11', 'L');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([5, 4]);
  });

  it('os dois na direita: 7 e 8', () => {
    const s = base();
    plan(s, 'p10', 'R');
    plan(s, 'p11', 'R');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([7, 8]);
  });

  it('um de cada lado: 5 e 7', () => {
    const s = base();
    plan(s, 'p10', 'L');
    plan(s, 'p11', 'R');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([5, 7]);
  });

  it('mortos são pulados', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [5], arc: { l: 6, r: 6 } });
    plan(s, 'p10', 'L');
    plan(s, 'p11', 'L');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([4, 3]);
  });

  it('as opções mostram o número que cada um pegaria agora', () => {
    const s = base();
    expect(sideChoices(s, 'p10')).toEqual([
      { side: 'L', seat: 5 },
      { side: 'R', seat: 7 },
    ]);
    plan(s, 'p10', 'L');
    expect(sideChoices(s, 'p11')).toEqual([
      { side: 'L', seat: 4 },
      { side: 'R', seat: 7 },
    ]);
  });

  it('alvo já congelado pelo parceiro não é repetido', () => {
    const s = base();
    plan(s, 'p11', 'L', 5);
    s.arc = { l: 5, r: 6 };
    plan(s, 'p10', 'L');
    expect(seatOf(s, 'p10')).toBe(4);
  });

  it('alvo reservado ou obrigatório aparece como alvo do assassino', () => {
    const s = base();
    s.killerTargets.p10 = { seat: 5, side: 'L', kind: 'reserved' };
    s.arc = { l: 5, r: 6 };
    plan(s, 'p11', 'L');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([5, 4]);
  });

  it('o próprio assassino ou o parceiro podem ser alvo', () => {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 9, r: 9 } });
    plan(s, 'p10', 'R');
    plan(s, 'p11', 'R');
    expect([seatOf(s, 'p10'), seatOf(s, 'p11')]).toEqual([10, 11]);
  });

  it('assassino sozinho escolhe um lado', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [11], arc: { l: 6, r: 6 } });
    expect(sideChoices(s, 'p10')).toEqual([
      { side: 'L', seat: 5 },
      { side: 'R', seat: 7 },
    ]);
  });

  it('poucos vivos: sem candidatos repetidos, e sem opção quando o arco fecha', () => {
    const roles = twentyRoles().slice(0, 10);
    roles[0] = 'killer';
    roles[1] = 'killer';
    roles[9] = 'citizen';
    // Vivos fora do arco 3..9: só o 10, e os assassinos 1 e 2.
    const s = makeState(roles, { round: 5, dead: [3, 4, 5, 6, 7, 8, 9], arc: { l: 3, r: 9 } });
    expect(sideChoices(s, 'p1')).toEqual([
      { side: 'L', seat: 2 },
      { side: 'R', seat: 10 },
    ]);
    const closed = makeState(roles, { round: 6, dead: [2, 3, 4, 5, 6, 7, 8, 9, 10], arc: { l: 2, r: 1 } });
    expect(sideChoices(closed, 'p1')).toEqual([]);
  });
});
