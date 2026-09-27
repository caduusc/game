import { describe, expect, it } from 'vitest';
import { ccw, cw, extendArc, inArc, sideCandidates, targetOptions } from '../arc';
import { resolveRound } from '../resolve';
import { ctx, makeState, seats, twentyRoles, weaponOf } from './helpers';

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
});

describe('candidatos do arco', () => {
  it('exemplo com 20 jogadores: o 3 morreu → (2,4), (1,2), (4,5)', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    expect(seats(targetOptions(s))).toEqual([
      [2, 4],
      [2, 1],
      [4, 5],
    ]);
  });

  it('pula mortos e dá a volta no círculo', () => {
    const alive = (s: number) => ![20, 1, 5].includes(s);
    const { L, R } = sideCandidates({ l: 2, r: 3 }, 20, alive);
    expect(L).toEqual([19, 18]);
    expect(R).toEqual([4, 6]);
  });

  it('pula mortos por policial sem criar arco novo', () => {
    // 3 morto pelos assassinos; 4 e 2 mortos por policial. O arco continua só no 3.
    const s = makeState(twentyRoles(), { round: 2, dead: [2, 3, 4], arc: { l: 3, r: 3 } });
    expect(seats(targetOptions(s))).toEqual([
      [1, 5],
      [1, 20],
      [5, 6],
    ]);
  });

  it('assassinos e parceiro podem ser alvo se forem os vizinhos', () => {
    // Assassinos nos assentos 10 e 11; arco no 9.
    const s = makeState(twentyRoles(), { round: 2, dead: [9], arc: { l: 9, r: 9 } });
    expect(seats(targetOptions(s))[0]).toEqual([8, 10]);
    expect(seats(targetOptions(s))[2]).toEqual([10, 11]);
  });
});

describe('alvo obrigatório', () => {
  it('erro em um alvo: ele fica obrigatório e o segundo é L1 ou R1 do arco', () => {
    // 3 morto; escolheram (1,2); só o 2 morreu → arco 1..3, o 1 é obrigatório: (1,20) ou (1,4).
    let s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[1]; // (2, 1)
    s.weaponAnswers['2'] = { by: 'p10', answer: weaponOf(s, 2) };
    s.weaponAnswers['1'] = { by: 'p11', answer: 'errado' };
    s = resolveRound(s, ctx()).state;
    expect(s.players.find((p) => p.seat === 2)!.status).toBe('dead');
    expect(s.players.find((p) => p.seat === 1)!.status).toBe('alive');
    expect(s.arc).toEqual({ l: 1, r: 3 });
    expect(s.pending).toEqual([1]);
    expect(seats(targetOptions(s))).toEqual([
      [1, 20],
      [1, 4],
    ]);
  });

  it('os dois alvos sobrevivem: ambos ficam obrigatórios', () => {
    let s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[0]; // (2, 4)
    s.weaponAnswers['2'] = { by: 'p10', answer: 'nada' };
    s.weaponAnswers['4'] = { by: 'p11', answer: 'nada' };
    s = resolveRound(s, ctx()).state;
    expect(s.arc).toEqual({ l: 2, r: 4 });
    expect(s.pending).toEqual([2, 4]);
    expect(seats(targetOptions(s))).toEqual([[2, 4]]);
  });

  it('sem resposta conta como erro e sem escolha vale (L1, R1)', () => {
    let s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s = resolveRound(s, ctx()).state;
    expect(s.pending).toEqual([2, 4]);
    expect(s.arc).toEqual({ l: 2, r: 4 });
  });

  it('alvo obrigatório morto por policial sai dos pendentes', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [1, 3], arc: { l: 1, r: 3 }, pending: [1] });
    expect(s.pending.length).toBe(1);
    // O pendente 1 morreu: sem obrigatório, voltam as três combinações a partir do arco 1..3.
    expect(seats(targetOptions(s))).toEqual([
      [20, 4],
      [20, 19],
      [4, 5],
    ]);
  });

  it('extendArc cobre alvos L2 e R1', () => {
    expect(extendArc({ l: 3, r: 3 }, [{ seat: 1, side: 'L' }, { seat: 2, side: 'L' }], 20)).toEqual({ l: 1, r: 3 });
    expect(extendArc({ l: 1, r: 2 }, [{ seat: 20, side: 'L' }, { seat: 3, side: 'R' }], 20)).toEqual({ l: 20, r: 3 });
  });
});

describe('assassino sozinho', () => {
  it('escolhe L1 ou R1', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [3, 11], arc: { l: 3, r: 3 } });
    expect(seats(targetOptions(s))).toEqual([[2], [4]]);
  });

  it('com parceiro preso também fica sozinho', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [3], arc: { l: 3, r: 3 } });
    s.players.find((p) => p.seat === 10)!.status = 'arrested';
    expect(seats(targetOptions(s))).toEqual([[2], [4]]);
  });

  it('com 1 pendente, ele é obrigatório', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [2, 11], arc: { l: 1, r: 3 }, pending: [1] });
    expect(seats(targetOptions(s))).toEqual([[1]]);
  });

  it('com 2 pendentes, escolhe um deles', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [3, 11], arc: { l: 2, r: 4 }, pending: [2, 4] });
    expect(seats(targetOptions(s))).toEqual([[2], [4]]);
  });

  it('o sobrevivente recebe o alvo único', () => {
    let s = makeState(twentyRoles(), { round: 3, dead: [3, 10], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[1]; // [4]
    s.weaponAnswers['4'] = { by: 'p11', answer: weaponOf(s, 4) };
    s = resolveRound(s, ctx()).state;
    expect(s.players.find((p) => p.seat === 4)!.status).toBe('dead');
    expect(s.arc).toEqual({ l: 3, r: 4 });
  });
});

describe('poucos vivos', () => {
  it('um único candidato fora do arco: sem duplicar', () => {
    // 10 jogadores; vivos fora do arco: só o 6.
    const roles = twentyRoles().slice(0, 10);
    roles[0] = 'killer';
    roles[1] = 'killer';
    roles[9] = 'citizen';
    const s = makeState(roles, { round: 5, dead: [3, 4, 5, 7, 8, 9, 10], arc: { l: 3, r: 5 } });
    // L walk from 3: 2 (killer, alive), 1 (killer, alive). R walk from 5: 6, 7x,8x,9x,10x, 1, 2
    expect(seats(targetOptions(s))).toEqual([
      [2, 6],
      [2, 1],
      [6, 1],
    ]);
  });

  it('candidatos insuficientes: usa os que existem', () => {
    const roles = twentyRoles().slice(0, 10);
    roles[0] = 'killer';
    roles[1] = 'killer';
    // Vivos: 1, 2 (assassinos). Arco cobre 3..10.
    const s = makeState(roles, { round: 6, dead: [3, 4, 5, 6, 7, 8, 9, 10], arc: { l: 3, r: 10 } });
    expect(seats(targetOptions(s))).toEqual([
      [2, 1],
    ]);
  });

  it('arco fechado sem ninguém fora: sem opções', () => {
    const roles = twentyRoles().slice(0, 10);
    roles[0] = 'killer';
    const s = makeState(roles, { round: 6, dead: [2, 3, 4, 5, 6, 7, 8, 9, 10], arc: { l: 2, r: 1 } });
    expect(targetOptions(s)).toEqual([]);
  });
});
