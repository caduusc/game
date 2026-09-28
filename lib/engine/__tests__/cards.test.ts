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

describe('tela uniforme', () => {
  it('todo jogador vivo tem 3 cards com o mesmo formato, em toda rodada', () => {
    let s = makeState(twentyRoles());
    for (let r = 0; r < 3; r++) {
      const proj = project(s);
      for (const p of s.players) {
        const views = proj.cards[p.id];
        expect(views).toHaveLength(3);
        for (const v of views) {
          expect(Object.keys(v).sort()).toEqual(['feedback', 'fields', 'options', 'prompt', 'round', 'skipLabel', 'slot', 'status', 'step', 'title']);
          expect(v.title).toMatch(/^Missão [123]$/);
          if (p.status === 'alive') expect(v.prompt.length).toBeGreaterThan(0);
        }
      }
      s = resolveRound(s, ctx(r)).state;
    }
  });

  it('tarefas decorativas usam texto, listas e botões', () => {
    const fields = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const s = makeState(twentyRoles(), { cards: false });
      s.cards = {};
      const proj = project(resolveRound(s, ctx(seed)).state);
      for (const v of proj.cards.p17) fields.add(v.fields);
    }
    expect([...fields].sort()).toEqual(['choice', 'choice_text', 'text']);
  });

  it('tarefa decorativa aceita qualquer resposta e não afeta o jogo', () => {
    const s = makeState(twentyRoles());
    const maniac = bySeat(s, 17);
    const before = JSON.stringify({ ...s, cards: null, usedRiddles: null });
    for (const c of s.cards[maniac.id]) {
      for (let guard = 0; guard < 5 && renderCard(s, maniac, c).status === 'open'; guard++) {
        const v = renderCard(s, maniac, c);
        submitCard(s, maniac.id, c.slot, { choice: v.options?.[0]?.value ?? null, text: 'qualquer coisa' }, ctx());
      }
      expect(c.feedback).toBe('Resposta registrada.');
    }
    expect(JSON.stringify({ ...s, cards: null, usedRiddles: null })).toBe(before);
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
    expect(s.cards.p12).toHaveLength(3);
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
    expect(s.cards.p15.every((c) => c.kind === 'decoy')).toBe(true);
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
