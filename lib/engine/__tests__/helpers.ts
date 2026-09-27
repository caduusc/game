import { CHARACTERS } from '../data/characters';
import { RIDDLES } from '../data/riddles';
import { generateHints } from '../hints';
import { seededRng } from '../rng';
import { startRound } from '../setup';
import type { EngineContext, GamePlayer, GameState, Role } from '../types';

export function ctx(seed = 1): EngineContext {
  return { rng: seededRng(seed), riddles: RIDDLES };
}

/**
 * Monta um estado com papéis definidos por assento (roles[0] = assento 1).
 * O personagem do assento i é CHARACTERS[i-1].
 */
export function makeState(
  roles: Role[],
  opts: { round?: number; dead?: number[]; arc?: { l: number; r: number } | null; pending?: number[]; cards?: boolean } = {},
): GameState {
  const characters = CHARACTERS.slice(0, roles.length);
  let k = 0;
  const players: GamePlayer[] = roles.map((role, i) => ({
    id: `p${i + 1}`,
    name: `Jogador ${i + 1}`,
    seat: i + 1,
    role,
    characterId: characters[i].id,
    killerSlot: role === 'killer' ? (k++ === 0 ? 'A' : 'B') : null,
    status: opts.dead?.includes(i + 1) ? 'dead' : 'alive',
  }));
  const a = players.find((p) => p.killerSlot === 'A');
  const b = players.find((p) => p.killerSlot === 'B');
  const charOf = (p?: GamePlayer) => characters.find((c) => c.id === p?.characterId) ?? characters[0];
  const state: GameState = {
    round: opts.round ?? 1,
    status: 'playing',
    winner: null,
    players,
    characters,
    citizenVerifyUses: 1,
    arc: opts.arc ?? null,
    pending: opts.pending ?? [],
    initialTarget: null,
    choice: null,
    weaponAnswers: {},
    policeShots: [],
    accusations: [],
    investigation: {
      questions: [
        { id: 1, seat: 1, type: 'birth', solved: false, lastAttemptRound: null },
        { id: 2, seat: 2, type: 'country', solved: false, lastAttemptRound: null },
        { id: 3, seat: 5, type: 'birth', solved: false, lastAttemptRound: null },
        { id: 4, seat: 6, type: 'country', solved: false, lastAttemptRound: null },
      ],
      hints: generateHints(charOf(a), charOf(b)),
      hintsUnlocked: 0,
      verifications: [],
    },
    citizens: Object.fromEntries(
      players
        .filter((p) => p.role === 'citizen')
        .map((p) => [p.id, { checkUses: 2, verifyUses: 1, lastCheckRound: null, lastVerifyRound: null }]),
    ),
    cards: {},
    results: {},
    announcements: [],
    maniacWon: [],
    usedRiddles: {},
  };
  if (opts.cards !== false) startRound(state, ctx());
  return state;
}

/** 20 jogadores: assassinos nos assentos 10 e 11, investigadores 12-14, policiais 15-16, maníaco 17. */
export function twentyRoles(): Role[] {
  const r: Role[] = Array(20).fill('citizen');
  r[9] = 'killer';
  r[10] = 'killer';
  r[11] = r[12] = r[13] = 'investigator';
  r[14] = r[15] = 'police';
  r[16] = 'maniac';
  return r;
}

export function seats(opts: { seat: number }[][]): number[][] {
  return opts.map((o) => o.map((t) => t.seat));
}

export function weaponOf(state: GameState, seat: number): string {
  const p = state.players.find((x) => x.seat === seat)!;
  return state.characters.find((c) => c.id === p.characterId)!.weapon;
}
