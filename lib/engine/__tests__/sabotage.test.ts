import { describe, expect, it } from 'vitest';
import { answerSabotage, openSabotage, sabotageBlocking, submitCard } from '../cards';
import { project } from '../project';
import { resolveRound } from '../resolve';
import type { GameState } from '../types';
import { addAttack, bySeat, ctx, makeState, twentyRoles } from './helpers';

/** Rodada 2 com o cidadão nº 1 como alvo do ataque que resolve nesta virada. */
function setup() {
  const s = makeState(twentyRoles(), { round: 2, arc: { l: 1, r: 1 } });
  addAttack(s, 1, null, null, 2);
  return s;
}

function sabotage(s: GameState, targetSeat: number) {
  const c = s.cards.p1.find((x) => x.kind === 'citizen_check')!;
  const res = submitCard(s, 'p1', c.slot, { text: c.riddle!.answers[0] }, ctx());
  expect(res).toMatch(/ESTÁ entre/);
  submitCard(s, 'p1', c.slot, { choice: 'yes' }, ctx());
  submitCard(s, 'p1', c.slot, { choice: String(targetSeat) }, ctx());
  submitCard(s, 'p1', c.slot, { choice: String(c.quiz![0].id) }, ctx());
  return c.quiz![0];
}

describe('sabotagem do cidadão', () => {
  it('fluxo completo: sabotado erra e o alvo passa para ele', () => {
    let s = setup();
    const q = sabotage(s, 4);
    const target = bySeat(s, 4);
    expect(project(s).secrets[target.id].data.sabotage).toMatchObject({ status: 'pending', seconds: 10, question: null });
    expect(sabotageBlocking(s)).toBe(true);
    openSabotage(s, target.id, 1_000_000);
    expect(project(s).secrets[target.id].data.sabotage?.options).toHaveLength(4);
    answerSabotage(s, target.id, (q.answer + 1) % 4, 1_003_000);
    expect(sabotageBlocking(s)).toBe(false);
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 1).status).toBe('alive');
    expect(bySeat(s, 4).status).toBe('dead');
    expect(s.announcements).toContainEqual({ kind: 'sabotage_ok', round: 2, seat: 1 });
    expect(s.citizens.p1.sabotageUsed).toBe(true);
  });

  it('sabotado acerta: alvo continua no cidadão', () => {
    let s = setup();
    const q = sabotage(s, 4);
    const target = bySeat(s, 4);
    openSabotage(s, target.id, 1_000_000);
    answerSabotage(s, target.id, q.answer, 1_005_000);
    s = resolveRound(s, ctx()).state;
    expect(bySeat(s, 1).status).toBe('dead');
    expect(bySeat(s, 4).status).toBe('alive');
    expect(s.announcements).toContainEqual({ kind: 'sabotage_fail', round: 2 });
  });

  it('resposta depois dos 10 segundos conta como erro', () => {
    const s = setup();
    const q = sabotage(s, 4);
    const target = bySeat(s, 4);
    openSabotage(s, target.id, 1_000_000);
    expect(answerSabotage(s, target.id, q.answer, 1_020_000)).toBe(false);
  });

  it('pergunta aberta e esquecida expira na virada', () => {
    let s = setup();
    sabotage(s, 4);
    openSabotage(s, bySeat(s, 4).id, 1_000_000);
    s = resolveRound(s, ctx(1, 1_060_000)).state;
    expect(bySeat(s, 4).status).toBe('dead');
  });

  it('os assassinos continuam vendo o alvo original', () => {
    const s = setup();
    const q = sabotage(s, 4);
    const target = bySeat(s, 4);
    openSabotage(s, target.id, 1_000_000);
    answerSabotage(s, target.id, (q.answer + 1) % 4, 1_001_000);
    expect(project(s).teams.killers.data.attacks[0].seat).toBe(1);
  });

  it('sem ataques em andamento, checar alvo não gasta o uso', () => {
    const s = makeState(twentyRoles(), { round: 2, arc: { l: 6, r: 6 } });
    const c = s.cards.p1.find((x) => x.kind === 'citizen_check')!;
    const fb = submitCard(s, 'p1', c.slot, { text: c.riddle!.answers[0] }, ctx());
    expect(fb).toMatch(/não há ataque/);
    expect(s.citizens.p1.checkUses).toBe(2);
  });

  it('cidadão fora dos alvos não recebe a opção de sabotar', () => {
    const s = setup();
    const c = s.cards.p2.find((x) => x.kind === 'citizen_check')!;
    expect(submitCard(s, 'p2', c.slot, { text: c.riddle!.answers[0] }, ctx())).toMatch(/NÃO está/);
    expect(c.done).toBe(true);
  });
});
