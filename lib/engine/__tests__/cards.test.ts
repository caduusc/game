import { describe, expect, it } from 'vitest';
import { renderCard, submitCard } from '../cards';
import { project } from '../project';
import { resolveRound } from '../resolve';
import { GameError, type Card, type GameState } from '../types';
import { bySeat, ctx, makeState, twentyRoles } from './helpers';

function card(s: GameState, pid: string, kind: Card['kind']): Card {
  const c = s.cards[pid].find((x) => x.kind === kind);
  if (!c) throw new Error(`sem card ${kind} para ${pid}`);
  return c;
}

describe('cards de ação', () => {
  it('cada jogador vê só as ações do seu papel, com título, explicação e botão de não fazer', () => {
    const s = makeState(twentyRoles());
    const proj = project(s);
    const titles = (id: string) => proj.cards[id].filter((c) => c.status !== 'gone').map((c) => c.title);
    expect(titles('p10')).toEqual(['Primeira morte']);
    expect(titles('p12')).toEqual(['Pistas', 'Verificação da equipe', 'Acusação']);
    expect(titles('p1')).toEqual(['Checar alvo', 'Verificar identidade']);
    expect(titles('p15')).toEqual([]); // policial só atira a partir da rodada 2
    expect(titles('p17')).toEqual([]); // maníaco não tem ações
    for (const c of proj.cards.p1) {
      expect(c.prompt).toMatch(/somente se quiser/);
      expect(c.skipLabel).toBeTruthy();
    }
    const police = project(makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } })).cards.p15[0];
    expect(police.title).toBe('Tiro');
    expect(police.prompt).toMatch(/^Responda esta charada somente se quiser atirar em alguém/);
  });

  it('não gera mais tarefas decorativas', () => {
    let s = makeState(twentyRoles());
    for (let r = 0; r < 3; r++) {
      expect(Object.values(s.cards).flat().some((c) => c.kind === 'decoy')).toBe(false);
      s = resolveRound(s, ctx(r)).state;
    }
  });

  it('pular não gasta nada', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_check');
    expect(submitCard(s, 'p1', c.slot, { skip: true }, ctx())).toMatch(/Nada foi gasto/);
    expect(s.citizens.p1.checkUses).toBe(2);
    expect(c.done).toBe(true);
  });

  it('assassino pode não atacar e mantém o alvo guardado', () => {
    const s = makeState(twentyRoles(), { round: 3, arc: { l: 5, r: 6 } });
    s.killerTargets.p10 = { seat: 5, side: 'L', kind: 'reserved' };
    submitCard(s, 'p10', 1, { skip: true }, ctx());
    expect(s.attacks).toEqual([]);
    expect(s.killerTargets.p10?.seat).toBe(5);
    expect(renderCard(s, bySeat(s, 10), card(s, 'p10', 'killer_action')).status).toBe('done');
  });

  it('valida as escolhas', () => {
    const s = makeState(twentyRoles());
    expect(() => submitCard(s, 'p10', 1, { choice: '99' }, ctx())).toThrow(GameError);
    expect(() => submitCard(s, 'p10', 1, { choice: '11' }, ctx())).toThrow(/opções/); // parceiro não é alvo inicial
  });
});

describe('investigadores', () => {
  it('acerto libera a próxima dica; uma tentativa por pergunta por rodada', () => {
    const s = makeState(twentyRoles());
    const birth1 = s.characters[0].birth.split('-').reverse().join('/');
    submitCard(s, 'p12', 1, { choice: '2', text: 'Japão' }, ctx());
    expect(() => submitCard(s, 'p13', 1, { choice: '2', text: s.characters[1].country }, ctx())).toThrow(/opções/);
    expect(submitCard(s, 'p13', 1, { choice: '1', text: birth1 }, ctx())).toMatch(/certa/);
    expect(project(s).teams.investigators.data.hints).toEqual([s.investigation.hints[0]]);
  });

  it('verificação: uma por rodada para a equipe toda', () => {
    const s = makeState(twentyRoles());
    expect(submitCard(s, 'p12', 2, { choice: '1', text: s.characters[0].name }, ctx())).toMatch(/VERDADE/);
    expect(() => submitCard(s, 'p13', 2, { choice: '2', text: 'Einstein' }, ctx())).toThrow(/concluída/);
  });

  it('acusação: uma por jogo', () => {
    let s = makeState(twentyRoles());
    submitCard(s, 'p12', 3, { choice: '4' }, ctx());
    s = resolveRound(s, ctx()).state;
    expect(s.cards.p12.some((c) => c.kind === 'inv_accuse')).toBe(false);
    expect(s.cards.p12.map((c) => c.kind)).toEqual(['inv_question', 'inv_verify']);
  });
});

describe('cidadãos', () => {
  it('checar alvo: duas tentativas erradas perdem o uso', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_check');
    submitCard(s, 'p1', c.slot, { text: 'zzzzzz' }, ctx());
    expect(s.citizens.p1.checkUses).toBe(2);
    submitCard(s, 'p1', c.slot, { text: 'zzzzzz' }, ctx());
    expect(s.citizens.p1.checkUses).toBe(1);
    expect(c.done).toBe(true);
  });

  it('verificar identidade: charada, depois jogador e personagem', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_verify');
    submitCard(s, 'p1', c.slot, { text: c.riddle!.answers[0] }, ctx());
    expect(submitCard(s, 'p1', c.slot, { choice: '2', text: 'Einstein' }, ctx())).toMatch(/MENTIRA/);
    expect(s.citizens.p1.verifyUses).toBe(0);
  });
});

describe('policiais', () => {
  it('não atiram na rodada 1', () => {
    const s = makeState(twentyRoles());
    expect(s.cards.p15).toEqual([]);
  });

  it('o card de tiro tem lista de jogadores e botão de não atirar', () => {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    const c = card(s, 'p15', 'police_shot');
    const v = renderCard(s, bySeat(s, 15), c);
    expect(v.fields).toBe('choice_text');
    expect(v.skipLabel).toBe('Não atirar nesta rodada');
    expect(v.options!.some((o) => o.value === '15')).toBe(false);
  });
});
