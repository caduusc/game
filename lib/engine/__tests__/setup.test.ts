import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { QUIZ } from '../data/quiz';
import { RIDDLES } from '../data/riddles';
import { isGridUnique, matchingCharacters, parseHints } from '../hints';
import { roleDistribution, setupGame } from '../setup';
import { project } from '../project';
import { ctx } from './helpers';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `P${i}` }));

describe('bancos', () => {
  it('24 personagens, armas únicas, grade única', () => {
    expect(CHARACTERS).toHaveLength(24);
    expect(new Set(CHARACTERS.map((c) => c.weapon)).size).toBe(24);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(24);
    expect(isGridUnique(CHARACTERS)).toBe(true);
  });

  it('cada combinação gênero+origem+século tem 3 áreas distintas', () => {
    const groups = new Map<string, string[]>();
    for (const c of CHARACTERS) {
      const k = `${c.gender}${c.origin}${c.century}`;
      groups.set(k, [...(groups.get(k) ?? []), c.area]);
    }
    expect(groups.size).toBe(8);
    for (const areas of groups.values()) expect(new Set(areas).size).toBe(3);
  });

  it('século bate com o ano de nascimento', () => {
    for (const c of CHARACTERS) {
      const y = +c.birth.slice(0, 4);
      expect(c.century, c.name).toBe(y <= 1900 ? 'XIX' : 'XX');
    }
  });

  it('pelo menos 80 perguntas de múltipla escolha com 4 opções', () => {
    expect(QUIZ.length).toBeGreaterThanOrEqual(80);
    expect(new Set(QUIZ.map((q) => q.question)).size).toBe(QUIZ.length);
    for (const q of QUIZ) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
    expect(new Set(QUIZ.map((q) => q.answer)).size).toBe(4);
  });

  it('pelo menos 80 charadas, sem perguntas repetidas', () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(RIDDLES.map((r) => r.question)).size).toBe(RIDDLES.length);
    for (const r of RIDDLES) expect(r.answers.length).toBeGreaterThan(0);
  });
});

describe('distribuição de papéis', () => {
  it.each([
    [10, 2, 2, 1, 1, 4, 2],
    [11, 2, 2, 1, 1, 5, 1],
    [14, 2, 2, 1, 1, 8, 1],
    [15, 2, 3, 2, 1, 7, 1],
    [17, 2, 3, 2, 1, 9, 1],
    [18, 2, 3, 2, 1, 10, 1],
    [20, 2, 3, 2, 1, 12, 1],
  ])('%i jogadores', (n, k, i, p, m, c, v) => {
    expect(roleDistribution(n)).toEqual({ killers: k, investigators: i, police: p, maniac: m, citizens: c, citizenVerifyUses: v });
  });

  it('recusa menos de 10 ou mais de 20', () => {
    expect(() => roleDistribution(9)).toThrow();
    expect(() => roleDistribution(21)).toThrow();
  });
});

describe('setupGame', () => {
  it('distribui números, papéis, personagens e cards', () => {
    for (const n of [10, 13, 16, 20]) {
      const s = setupGame({ players: players(n), characters: CHARACTERS }, ctx(n));
      expect(s.players.map((p) => p.seat).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(new Set(s.players.map((p) => p.characterId)).size).toBe(n);
      expect(s.players.filter((p) => p.killerSlot === 'A')).toHaveLength(1);
      expect(s.players.filter((p) => p.killerSlot === 'B')).toHaveLength(1);
      const expected = { killer: 1, investigator: 3, citizen: 2, police: 0, maniac: 0 } as const;
      for (const p of s.players) expect(s.cards[p.id]).toHaveLength(expected[p.role]);
      // perguntas dos investigadores: 4, em assentos distintos, nunca investigadores
      const qs = s.investigation.questions;
      expect(qs).toHaveLength(4);
      expect(new Set(qs.map((q) => q.seat)).size).toBe(4);
      for (const q of qs) expect(s.players.find((p) => p.seat === q.seat)!.role).not.toBe('investigator');
      expect(qs.filter((q) => q.type === 'birth')).toHaveLength(2);
    }
  });

  it('as 4 dicas identificam exatamente os dois assassinos', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 10 + (seed % 11);
      const s = setupGame({ players: players(n), characters: CHARACTERS }, ctx(seed));
      for (const slot of ['A', 'B'] as const) {
        const killer = s.players.find((p) => p.killerSlot === slot)!;
        const attrs = parseHints(s.investigation.hints, slot)!;
        const matches = matchingCharacters(s.characters, attrs);
        expect(matches.map((m) => m.id)).toEqual([killer.characterId]);
      }
    }
  });

  it('a projeção não vaza armas nem respostas para quem não deve', () => {
    const s = setupGame({ players: players(12), characters: CHARACTERS }, ctx(3));
    const proj = project(s);
    const answers = new Set(Object.values(s.cards).flat().flatMap((c) => c.riddle?.answers ?? []).filter((a) => a.length > 3));
    for (const cards of Object.values(proj.cards)) {
      const json = JSON.stringify(cards);
      for (const a of answers) expect(json.includes(`"${a}"`)).toBe(false);
      expect(json).not.toMatch(/kind|killer_|citizen_|inv_|police_|decoy|"answer"/);
    }
    const invJson = JSON.stringify(proj.teams.investigators.data);
    for (const c of s.characters) expect(invJson.includes(c.weapon)).toBe(false);
    expect(proj.teams.investigators.data.hints).toEqual([]);
    expect(proj.reveal).toBeNull();
  });
});
