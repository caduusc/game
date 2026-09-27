import { describe, expect, it } from 'vitest';
import { renderCard, submitCard } from '../cards';
import { project } from '../project';
import { resolveRound } from '../resolve';
import { GameError, type Card, type GameState } from '../types';
import { ctx, makeState, twentyRoles, weaponOf } from './helpers';

function card(s: GameState, pid: string, kind: Card['kind']): Card {
  const c = s.cards[pid].find((x) => x.kind === kind);
  if (!c) throw new Error(`sem card ${kind} para ${pid}`);
  return c;
}

describe('tela uniforme', () => {
  it('todo jogador vivo tem 3 cards com o mesmo formato, em toda rodada', () => {
    let s = makeState(twentyRoles());
    s.initialTarget = 1;
    for (let r = 0; r < 3; r++) {
      const proj = project(s);
      for (const p of s.players) {
        const views = proj.cards[p.id];
        expect(views).toHaveLength(3);
        for (const v of views) {
          expect(Object.keys(v).sort()).toEqual(['feedback', 'fields', 'prompt', 'round', 'slot', 'status', 'step', 'title']);
          expect(v.title).toMatch(/^Missão [123]$/);
          if (p.status === 'alive') expect(v.prompt.length).toBeGreaterThan(0);
        }
      }
      s = resolveRound(s, ctx(r)).state;
    }
  });

  it('tarefa decorativa aceita qualquer resposta e não afeta o jogo', () => {
    const s = makeState(twentyRoles());
    const maniac = s.players.find((p) => p.role === 'maniac')!;
    const before = JSON.stringify({ ...s, cards: null, usedRiddles: null });
    for (const c of s.cards[maniac.id]) {
      while (renderCard(s, maniac, c).status === 'open') {
        const fields = renderCard(s, maniac, c).fields;
        submitCard(s, maniac.id, c.slot, { number: fields === 'text' ? null : 3, text: 'qualquer coisa' }, ctx());
      }
      expect(c.feedback).toBe('Resposta registrada.');
    }
    expect(JSON.stringify({ ...s, cards: null, usedRiddles: null })).toBe(before);
  });

  it('valida campos obrigatórios', () => {
    const s = makeState(twentyRoles());
    expect(() => submitCard(s, 'p10', 1, { number: null, text: '' }, ctx())).toThrow(GameError);
  });
});

describe('assassinos', () => {
  it('rodada 1: qualquer um registra, vale a última escolha', () => {
    const s = makeState(twentyRoles());
    submitCard(s, 'p10', 1, { number: 5 }, ctx());
    submitCard(s, 'p11', 1, { number: 7 }, ctx());
    expect(s.initialTarget).toBe(7);
    expect(project(s).teams.killers.data.initialTarget).toBe(7);
    expect(renderCard(s, s.players[9], s.cards.p10[0]).prompt).toContain('nº 7');
  });

  it('rodada 2: escolha trava depois da primeira resposta de arma', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    submitCard(s, 'p10', 1, { text: '1 e 2' }, ctx());
    expect(s.choice!.map((t) => t.seat)).toEqual([2, 1]);
    expect(renderCard(s, s.players[9], card(s, 'p10', 'killer_weapon')).prompt).toBe('O que mata o número 2?');
    expect(renderCard(s, s.players[10], card(s, 'p11', 'killer_weapon')).prompt).toBe('O que mata o número 1?');
    submitCard(s, 'p11', 2, { text: weaponOf(s, 1) }, ctx());
    expect(() => submitCard(s, 'p10', 1, { text: '2 4' }, ctx())).toThrow();
    expect(() => submitCard(s, 'p11', 2, { text: 'outra' }, ctx())).toThrow(/concluída/);
  });

  it('sem escolha, o card de arma usa (L1, R1) e responder trava essa escolha', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    expect(renderCard(s, s.players[9], card(s, 'p10', 'killer_weapon')).prompt).toMatch(/^O que mata o número 2\?.*padrão 2 e 4/);
    submitCard(s, 'p10', 2, { text: weaponOf(s, 2) }, ctx());
    expect(s.choice!.map((t) => t.seat)).toEqual([2, 4]);
    expect(renderCard(s, s.players[10], card(s, 'p11', 'killer_weapon')).prompt).toBe('O que mata o número 4?');
    expect(() => submitCard(s, 'p11', 1, { text: '1 e 2' }, ctx())).toThrow(/concluída/);
  });

  it('opção inválida é recusada', () => {
    const s = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    expect(() => submitCard(s, 'p10', 1, { text: '5 e 9' }, ctx())).toThrow(/Opção inválida/);
  });
});

describe('investigadores', () => {
  function withQuestions() {
    const s = makeState(twentyRoles());
    s.investigation.questions = [
      { id: 1, seat: 15, type: 'birth', solved: false, lastAttemptRound: null },
      { id: 2, seat: 1, type: 'country', solved: false, lastAttemptRound: null },
    ];
    return s;
  }

  it('acerto libera a próxima dica; uma tentativa por pergunta por rodada', () => {
    const s = withQuestions();
    const birth15 = s.characters[14].birth.split('-').reverse().join('/');
    submitCard(s, 'p12', 1, { number: 1, text: 'França' }, ctx());
    expect(() => submitCard(s, 'p13', 1, { number: 1, text: s.characters[0].country }, ctx())).toThrow(/Não há pergunta/);
    const fb = submitCard(s, 'p13', 1, { number: 15, text: birth15 }, ctx());
    expect(fb).toMatch(/certa/);
    expect(project(s).teams.investigators.data.hints).toEqual([s.investigation.hints[0]]);
  });

  it('verificação: uma por rodada para a equipe toda', () => {
    const s = makeState(twentyRoles());
    const fb = submitCard(s, 'p12', 2, { number: 1, text: s.characters[0].name }, ctx());
    expect(fb).toMatch(/VERDADE/);
    expect(() => submitCard(s, 'p13', 2, { number: 2, text: 'Einstein' }, ctx())).toThrow(/concluída/);
    expect(project(s).teams.investigators.data.verifications).toHaveLength(1);
  });

  it('acusação: uma por jogo', () => {
    let s = makeState(twentyRoles());
    submitCard(s, 'p12', 3, { number: 4 }, ctx());
    s.initialTarget = 1;
    s = resolveRound(s, ctx()).state;
    expect(s.cards.p12.some((c) => c.kind === 'inv_accuse')).toBe(false);
    expect(s.cards.p12).toHaveLength(3);
  });
});

describe('cidadãos', () => {
  it('checar alvo: sem escolha dos assassinos, avisa e não consome', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_check');
    const answer = c.riddle!.answers[0];
    const fb = submitCard(s, 'p1', c.slot, { text: answer }, ctx());
    expect(fb).toMatch(/ainda não escolheram/);
    expect(s.citizens.p1.checkUses).toBe(2);
    s.initialTarget = 1;
    const fb2 = submitCard(s, 'p1', c.slot, { text: 'de novo' }, ctx());
    expect(fb2).toMatch(/ESTÁ entre/);
    expect(s.citizens.p1.checkUses).toBe(1);
    expect(s.results.p1).toHaveLength(1);
  });

  it('checar alvo: duas tentativas erradas perdem o uso', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_check');
    submitCard(s, 'p1', c.slot, { text: 'zzzzzz' }, ctx());
    expect(s.citizens.p1.checkUses).toBe(2);
    submitCard(s, 'p1', c.slot, { text: 'zzzzzz' }, ctx());
    expect(s.citizens.p1.checkUses).toBe(1);
    expect(c.done).toBe(true);
  });

  it('verificar identidade: charada, depois número e personagem', () => {
    const s = makeState(twentyRoles());
    const c = card(s, 'p1', 'citizen_verify');
    submitCard(s, 'p1', c.slot, { text: c.riddle!.answers[0] }, ctx());
    const fb = submitCard(s, 'p1', c.slot, { number: 2, text: 'Einstein' }, ctx());
    expect(fb).toMatch(/MENTIRA/);
    expect(s.citizens.p1.verifyUses).toBe(0);
  });
});

describe('policiais', () => {
  it('não atiram na rodada 1; na rodada 2 registram tiro com charada', () => {
    const s = makeState(twentyRoles());
    expect(s.cards.p15.every((c) => c.kind === 'decoy')).toBe(true);
    const s2 = makeState(twentyRoles(), { round: 2, dead: [3], arc: { l: 3, r: 3 } });
    const c = card(s2, 'p15', 'police_shot');
    submitCard(s2, 'p15', c.slot, { number: 10, text: c.riddle!.answers[0] }, ctx());
    expect(s2.policeShots).toEqual([{ by: 'p15', seat: 10, correct: true }]);
    expect(() => submitCard(s2, 'p15', c.slot, { number: 9, text: 'x' }, ctx())).toThrow();
  });
});
