import { describe, expect, it } from 'vitest';
import { targetOptions } from '../arc';
import { checkVictory, endGame, resolveRound } from '../resolve';
import type { GamePlayer, Role } from '../types';
import { ctx, makeState, twentyRoles, weaponOf } from './helpers';

const bySeat = (s: { players: GamePlayer[] }, seat: number) => s.players.find((p) => p.seat === seat)!;

describe('rodada 1', () => {
  it('o alvo inicial morre na virada, sem charada', () => {
    const s = makeState(twentyRoles());
    s.initialTarget = 7;
    const { state, outcome } = resolveRound(s, ctx());
    expect(outcome.killedByKillers).toEqual([7]);
    expect(bySeat(state, 7).status).toBe('dead');
    expect(state.arc).toEqual({ l: 7, r: 7 });
    expect(state.round).toBe(2);
    expect(state.announcements).toEqual([
      { round: 1, playerId: 'p7', name: 'Jogador 7', seat: 7, kind: 'death', characterName: state.characters[6].name },
    ]);
  });

  it('sem escolha, o app sorteia um alvo que não é assassino', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { state } = resolveRound(makeState(twentyRoles()), ctx(seed));
      const dead = state.players.filter((p) => p.status === 'dead');
      expect(dead).toHaveLength(1);
      expect(dead[0].role).not.toBe('killer');
    }
  });

  it('não altera o estado original', () => {
    const s = makeState(twentyRoles());
    s.initialTarget = 1;
    resolveRound(s, ctx());
    expect(s.round).toBe(1);
    expect(bySeat(s, 1).status).toBe('alive');
  });
});

describe('resolução simultânea', () => {
  it('assassino morto por policial na mesma virada ainda mata seu alvo', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[0]; // (2,4): A=10→2, B=11→4
    s.weaponAnswers['2'] = { by: 'p10', answer: weaponOf(s, 2) };
    s.policeShots.push({ by: 'p15', seat: 10, correct: true });
    const { state, outcome } = resolveRound(s, ctx());
    expect(outcome.killedByKillers).toEqual([2]);
    expect(outcome.killedByPolice).toEqual([10]);
    expect(bySeat(state, 2).status).toBe('dead');
    expect(bySeat(state, 10).status).toBe('dead');
  });

  it('assassino preso na mesma virada ainda mata seu alvo', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[0];
    s.weaponAnswers['4'] = { by: 'p11', answer: weaponOf(s, 4) };
    s.accusations.push({ by: 'p12', seat: 11, round: 2 });
    const { state } = resolveRound(s, ctx());
    expect(bySeat(state, 4).status).toBe('dead');
    expect(bySeat(state, 11).status).toBe('arrested');
    expect(state.announcements.map((a) => [a.seat, a.kind])).toEqual([
      [4, 'death'],
      [11, 'arrest'],
    ]);
  });

  it('acusação errada não tem efeito', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.accusations.push({ by: 'p12', seat: 5, round: 2 });
    const { outcome } = resolveRound(s, ctx());
    expect(outcome.arrested).toEqual([]);
  });

  it('acusado que também leva tiro é anunciado como morto', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.accusations.push({ by: 'p12', seat: 10, round: 2 });
    s.policeShots.push({ by: 'p15', seat: 10, correct: true });
    const { state } = resolveRound(s, ctx());
    expect(bySeat(state, 10).status).toBe('dead');
  });

  it('tiro de policial com charada errada não mata; policiais podem se matar', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.policeShots.push({ by: 'p15', seat: 16, correct: true });
    s.policeShots.push({ by: 'p16', seat: 5, correct: false });
    const { state } = resolveRound(s, ctx());
    expect(bySeat(state, 16).status).toBe('dead');
    expect(bySeat(state, 5).status).toBe('alive');
  });

  it('morte por policial não estende o arco', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s.choice = targetOptions(s)[0]; // (2,4)
    s.weaponAnswers['2'] = { by: 'p10', answer: weaponOf(s, 2) };
    s.weaponAnswers['4'] = { by: 'p11', answer: weaponOf(s, 4) };
    s.policeShots.push({ by: 'p15', seat: 8, correct: true });
    const { state } = resolveRound(s, ctx());
    expect(state.arc).toEqual({ l: 2, r: 4 });
    expect(bySeat(state, 8).status).toBe('dead');
  });

  it('maníaco vence ao morrer por assassino ou policial, sem encerrar o jogo', () => {
    const s = makeState(twentyRoles());
    s.initialTarget = 17;
    const { state } = resolveRound(s, ctx());
    expect(state.maniacWon).toEqual(['p17']);
    expect(state.status).toBe('playing');

    const s2 = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    s2.policeShots.push({ by: 'p15', seat: 17, correct: true });
    expect(resolveRound(s2, ctx()).state.maniacWon).toEqual(['p17']);
  });
});

describe('vitória', () => {
  const P = (seat: number, role: Role, status: GamePlayer['status'] = 'alive'): GamePlayer => ({
    id: `p${seat}`,
    name: `J${seat}`,
    seat,
    role,
    characterId: 'x',
    killerSlot: null,
    status,
  });

  it('assassinos vencem com todos os cidadãos mortos (maníaco não conta)', () => {
    const before = [P(1, 'killer'), P(2, 'citizen'), P(3, 'investigator'), P(4, 'maniac')];
    const after = [P(1, 'killer'), P(2, 'citizen', 'dead'), P(3, 'investigator'), P(4, 'maniac')];
    expect(checkVictory(before, after)).toBe('killers');
  });

  it('assassinos vencem com investigadores e policiais mortos', () => {
    const before = [P(1, 'killer'), P(2, 'citizen'), P(3, 'investigator'), P(4, 'police')];
    const after = [P(1, 'killer'), P(2, 'citizen'), P(3, 'investigator', 'dead'), P(4, 'police', 'dead')];
    expect(checkVictory(before, after)).toBe('killers');
  });

  it('basta um assassino vivo', () => {
    const before = [P(1, 'killer'), P(5, 'killer', 'arrested'), P(2, 'citizen')];
    const after = [P(1, 'killer'), P(5, 'killer', 'arrested'), P(2, 'citizen', 'dead')];
    expect(checkVictory(before, after)).toBe('killers');
  });

  it('bem vence com os dois assassinos mortos ou presos', () => {
    const before = [P(1, 'killer'), P(5, 'killer'), P(2, 'citizen'), P(3, 'police')];
    const after = [P(1, 'killer', 'dead'), P(5, 'killer', 'arrested'), P(2, 'citizen'), P(3, 'police')];
    expect(checkVictory(before, after)).toBe('good');
  });

  it('ninguém vence ainda', () => {
    const ps = [P(1, 'killer'), P(2, 'citizen'), P(3, 'police')];
    expect(checkVictory(ps, ps)).toBeNull();
  });

  it('empate na mesma virada: assassinos vencem', () => {
    // O último assassino é preso na mesma virada em que mata o último cidadão.
    const before = [P(1, 'killer'), P(5, 'killer', 'dead'), P(2, 'citizen'), P(3, 'investigator')];
    const after = [P(1, 'killer', 'arrested'), P(5, 'killer', 'dead'), P(2, 'citizen', 'dead'), P(3, 'investigator')];
    expect(checkVictory(before, after)).toBe('killers');
  });

  it('empate completo via resolveRound', () => {
    const roles: Role[] = ['killer', 'citizen', 'investigator', 'killer', 'police', 'maniac', 'citizen', 'investigator', 'citizen', 'citizen'];
    // Vivos: 1 (A), 2 (cidadão), 3 (investigador), 5 (policial). Arco 3..? — alvo 2 (L1 de 3).
    const s = makeState(roles, { round: 4, dead: [4, 6, 7, 8, 9, 10], arc: { l: 3, r: 10 }, pending: [3] });
    // Assassino A sozinho, pendente 3 (investigador). Troca: sem pendente para mirar o cidadão 2.
    s.pending = [];
    s.arc = { l: 3, r: 10 };
    const opts = targetOptions(s);
    const withTwo = opts.find((o) => o.some((t) => t.seat === 2))!;
    s.choice = withTwo;
    s.weaponAnswers['2'] = { by: 'p1', answer: weaponOf(s, 2) };
    s.accusations.push({ by: 'p3', seat: 1, round: 4 });
    const { state } = resolveRound(s, ctx());
    expect(bySeat(state, 2).status).toBe('dead');
    expect(bySeat(state, 1).status).toBe('arrested');
    expect(state.status).toBe('finished');
    expect(state.winner).toBe('killers');
  });

  it('bem vence via resolveRound e fica sem cards', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [3, 10], arc: { l: 3, r: 3 } });
    s.accusations.push({ by: 'p12', seat: 11, round: 3 });
    const { state } = resolveRound(s, ctx());
    expect(state.winner).toBe('good');
    expect(Object.values(state.cards).every((c) => c.length === 0)).toBe(true);
  });

  it('host pode encerrar sem vencedor', () => {
    const s = endGame(makeState(twentyRoles()));
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('none');
  });
});
