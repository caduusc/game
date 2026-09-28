import { describe, expect, it } from 'vitest';
import { renderCard, submitCard } from '../cards';
import { checkVictory, endGame, resolveRound } from '../resolve';
import type { GamePlayer, GameState, Role } from '../types';
import { addAttack, bySeat, ctx, makeState, twentyRoles, weaponOf } from './helpers';

const killerCard = (s: GameState, id: string) => s.cards[id].find((c) => c.kind === 'killer_action' || c.kind === 'killer_initial')!;

describe('rodada 1: alvo inicial por acordo', () => {
  it('com acordo, o alvo é anunciado na virada 1→2 e só morre na virada 2→3', () => {
    let s = makeState(twentyRoles());
    submitCard(s, 'p10', killerCard(s, 'p10').slot, { choice: '7' }, ctx());
    submitCard(s, 'p11', killerCard(s, 'p11').slot, { choice: '7' }, ctx());
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 7).status).toBe('alive');
    expect(s.announcements).toEqual([{ kind: 'targeted', round: 1, count: 1 }]);
    expect(s.arc).toEqual({ l: 7, r: 7 });
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 7).status).toBe('dead');
    expect(s.announcements.at(-1)).toMatchObject({ kind: 'death', round: 2, seat: 7 });
  });

  it('sem acordo, mostra a mensagem e o app sorteia alguém que não é assassino', () => {
    const s = makeState(twentyRoles());
    submitCard(s, 'p10', 1, { choice: '3' }, ctx());
    submitCard(s, 'p11', 1, { choice: '8' }, ctx());
    const prompt = renderCard(s, bySeat(s, 10), killerCard(s, 'p10')).prompt;
    expect(prompt).toContain('o Assassino A escolheu o nº 3 e o Assassino B escolheu o nº 8');
    expect(prompt).toContain('Um dos dois precisa trocar');
    for (let seed = 1; seed < 20; seed++) {
      const next = resolveRound(s, ctx(seed)).state;
      const target = next.attacks[0].seat;
      expect(bySeat(next, target).role).not.toBe('killer');
    }
  });

  it('não altera o estado original', () => {
    const s = makeState(twentyRoles());
    resolveRound(s, ctx());
    expect(s.round).toBe(1);
    expect(s.attacks).toEqual([]);
  });
});

describe('rodada 2+: lado e arma', () => {
  function round2() {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    addAttack(s, 6, null, null, 2);
    return s;
  }

  it('arma certa: escolhido na rodada 2, morre na virada 3→4', () => {
    let s = round2();
    submitCard(s, 'p10', 1, { choice: 'L' }, ctx());
    submitCard(s, 'p10', 1, { choice: weaponOf(s, 5) }, ctx());
    s = resolveRound(s, ctx()).state; // 2→3: morre o 6
    expect(bySeat(s, 6).status).toBe('dead');
    expect(bySeat(s, 5).status).toBe('alive');
    expect(s.announcements.filter((a) => a.round === 2).map((a) => a.kind)).toEqual(['death', 'targeted']);
    s = resolveRound(s, ctx()).state; // 3→4: morre o 5
    expect(bySeat(s, 5).status).toBe('dead');
  });

  it('arma errada: o alvo sobrevive e fica obrigatório', () => {
    let s = round2();
    submitCard(s, 'p10', 1, { choice: 'L' }, ctx());
    const wrong = s.characters.find((c) => c.weapon !== weaponOf(s, 5))!.weapon;
    submitCard(s, 'p10', 1, { choice: wrong }, ctx());
    s = resolveRound(s, ctx()).state;
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 5).status).toBe('alive');
    expect(s.killerTargets.p10).toEqual({ seat: 5, side: 'L', kind: 'obligatory' });
    const view = renderCard(s, bySeat(s, 10), killerCard(s, 'p10'));
    expect(view.prompt).toContain('obrigatório');
    expect(view.options!.some((o) => o.label === 'Trocar de lado')).toBe(false);
  });

  it('"Não sabemos ainda" reserva o alvo; depois dá para trocar de lado', () => {
    let s = round2();
    submitCard(s, 'p10', 1, { choice: 'L' }, ctx());
    submitCard(s, 'p10', 1, { choice: '__unknown' }, ctx());
    expect(s.attacks.filter((a) => a.killerId)).toHaveLength(0);
    s = resolveRound(s, ctx()).state;
    expect(s.killerTargets.p10).toEqual({ seat: 5, side: 'L', kind: 'reserved' });
    submitCard(s, 'p10', 1, { choice: '__switch' }, ctx());
    expect(renderCard(s, bySeat(s, 10), killerCard(s, 'p10')).prompt).toContain('Direita');
    submitCard(s, 'p10', 1, { choice: weaponOf(s, 7) }, ctx());
    expect(s.attacks.find((a) => a.killerId === 'p10')!.seat).toBe(7);
  });

  it('ninguém escolhe: nenhum ataque novo', () => {
    let s = round2();
    s = resolveRound(s, ctx()).state;
    expect(s.attacks).toEqual([]);
    expect(s.announcements.some((a) => a.kind === 'targeted')).toBe(false);
  });

  it('assassino preso ainda mata o alvo que já estava em andamento', () => {
    let s = makeState(twentyRoles(), { round: 3, arc: { l: 5, r: 6 } });
    addAttack(s, 5, 'p10', weaponOf(s, 5), 3);
    s.accusations.push({ by: 'p12', seat: 10, round: 3 });
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 5).status).toBe('dead');
    expect(bySeat(s, 10).status).toBe('arrested');
  });
});

describe('policiais', () => {
  it('tiro na rodada X mata na virada X→X+1; 2 tiros no jogo; pode não atirar', () => {
    let s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    const card = () => s.cards.p15.find((c) => c.kind === 'police_shot')!;
    submitCard(s, 'p15', card().slot, { skip: true }, ctx());
    expect(s.policeShotsLeft.p15).toBe(2);
    s = resolveRound(s, ctx()).state;
    submitCard(s, 'p15', card().slot, { choice: '3', text: card().riddle!.answers[0] }, ctx());
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 3).status).toBe('dead');
    expect(s.policeShotsLeft.p15).toBe(1);
  });

  it('3 tentativas por charada; errar as 3 gasta o tiro', () => {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    const c = s.cards.p15.find((x) => x.kind === 'police_shot')!;
    submitCard(s, 'p15', c.slot, { choice: '3', text: 'zzzz' }, ctx());
    submitCard(s, 'p15', c.slot, { choice: '3', text: 'zzzz' }, ctx());
    expect(s.policeShotsLeft.p15).toBe(2);
    submitCard(s, 'p15', c.slot, { choice: '3', text: 'zzzz' }, ctx());
    expect(s.policeShotsLeft.p15).toBe(1);
    expect(c.done).toBe(true);
  });

  it('sem tiros, o policial fica sem cards', () => {
    let s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    s.policeShotsLeft.p15 = 0;
    s = resolveRound(s, ctx()).state;
    expect(s.cards.p15).toEqual([]);
  });
});

describe('resolução simultânea e maníaco', () => {
  it('maníaco vence ao morrer por assassino ou policial, sem encerrar o jogo', () => {
    let s = makeState(twentyRoles(), { round: 2, arc: { l: 17, r: 17 } });
    addAttack(s, 17, null, null, 2);
    s = resolveRound(s, ctx()).state;
    expect(s.maniacWon).toEqual(['p17']);
    expect(s.status).toBe('playing');
  });

  it('acusado que também leva tiro é anunciado como morto', () => {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    s.accusations.push({ by: 'p12', seat: 10, round: 2 });
    s.policeShots.push({ by: 'p15', seat: 10 });
    expect(bySeat(resolveRound(s, ctx()).state, 10).status).toBe('dead');
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

  it('bem vence com os dois assassinos mortos ou presos', () => {
    const before = [P(1, 'killer'), P(5, 'killer'), P(2, 'citizen'), P(3, 'police')];
    const after = [P(1, 'killer', 'dead'), P(5, 'killer', 'arrested'), P(2, 'citizen'), P(3, 'police')];
    expect(checkVictory(before, after)).toBe('good');
  });

  it('empate na mesma virada: assassinos vencem', () => {
    const before = [P(1, 'killer'), P(5, 'killer', 'dead'), P(2, 'citizen'), P(3, 'investigator')];
    const after = [P(1, 'killer', 'arrested'), P(5, 'killer', 'dead'), P(2, 'citizen', 'dead'), P(3, 'investigator')];
    expect(checkVictory(before, after)).toBe('killers');
  });

  it('empate completo via resolveRound', () => {
    const roles: Role[] = ['killer', 'citizen', 'investigator', 'killer', 'police', 'maniac', 'citizen', 'investigator', 'citizen', 'citizen'];
    const s = makeState(roles, { round: 4, dead: [4, 6, 7, 8, 9, 10], arc: { l: 2, r: 2 } });
    addAttack(s, 2, 'p1', weaponOf(s, 2), 4); // último cidadão
    s.accusations.push({ by: 'p3', seat: 1, round: 4 }); // último assassino preso
    const next = resolveRound(s, ctx()).state;
    expect(bySeat(next, 2).status).toBe('dead');
    expect(bySeat(next, 1).status).toBe('arrested');
    expect(next.winner).toBe('killers');
  });

  it('bem vence e todos ficam sem cards', () => {
    const s = makeState(twentyRoles(), { round: 3, dead: [10], arc: { l: 3, r: 3 } });
    s.accusations.push({ by: 'p12', seat: 11, round: 3 });
    const next = resolveRound(s, ctx()).state;
    expect(next.winner).toBe('good');
    expect(Object.values(next.cards).every((c) => c.length === 0)).toBe(true);
  });

  it('host pode encerrar sem vencedor', () => {
    const s = endGame(makeState(twentyRoles()));
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('none');
  });
});
