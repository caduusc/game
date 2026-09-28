import { buildCards, POLICE_SHOTS } from './cards';
import { generateHints, isGridUnique } from './hints';
import { shuffle } from './rng';
import {
  GameError,
  type Character,
  type EngineContext,
  type GamePlayer,
  type GameState,
  type Question,
  type Role,
} from './types';

export const MIN_PLAYERS = 10;
export const MAX_PLAYERS = 20;

export interface RoleDistribution {
  killers: number;
  investigators: number;
  police: number;
  maniac: number;
  citizens: number;
  citizenVerifyUses: number;
}

export function roleDistribution(n: number): RoleDistribution {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new GameError(`A partida precisa de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
  }
  const big = n >= 15;
  const investigators = big ? 3 : 2;
  const police = big ? 2 : 1;
  const killers = 2;
  const maniac = 1;
  return {
    killers,
    investigators,
    police,
    maniac,
    citizens: n - killers - investigators - police - maniac,
    citizenVerifyUses: n === 10 ? 2 : 1,
  };
}

export const CITIZEN_CHECK_USES = 2;

/** Primeira rodada começa aqui; também zera o estado por rodada e distribui os cards. */
export function startRound(state: GameState, ctx: EngineContext): void {
  state.killerPlans = {};
  state.policeShots = [];
  for (const p of state.players) {
    state.cards[p.id] = p.status === 'alive' ? buildCards(state, p, ctx) : [];
  }
}

export function setupGame(
  input: { players: { id: string; name: string }[]; characters: Character[] },
  ctx: EngineContext,
): GameState {
  const n = input.players.length;
  const dist = roleDistribution(n);
  if (input.characters.length < n) throw new GameError('Personagens insuficientes no banco.');

  const seated = shuffle(ctx.rng, input.players);
  const characters = shuffle(ctx.rng, input.characters).slice(0, n);
  if (!isGridUnique(characters)) {
    throw new Error('Banco de personagens inválido: combinação + área repetida.');
  }
  const roles: Role[] = shuffle(ctx.rng, [
    ...Array<Role>(dist.killers).fill('killer'),
    ...Array<Role>(dist.investigators).fill('investigator'),
    ...Array<Role>(dist.police).fill('police'),
    ...Array<Role>(dist.maniac).fill('maniac'),
    ...Array<Role>(dist.citizens).fill('citizen'),
  ]);

  let killerCount = 0;
  const players: GamePlayer[] = seated.map((p, i) => {
    const role = roles[i];
    return {
      id: p.id,
      name: p.name,
      seat: i + 1,
      role,
      characterId: characters[i].id,
      killerSlot: role === 'killer' ? (killerCount++ === 0 ? 'A' : 'B') : null,
      status: 'alive',
    };
  });

  const charOf = (p: GamePlayer) => characters.find((c) => c.id === p.characterId)!;
  const killerA = players.find((p) => p.killerSlot === 'A')!;
  const killerB = players.find((p) => p.killerSlot === 'B')!;

  const questionSeats = shuffle(
    ctx.rng,
    players.filter((p) => p.role !== 'investigator').map((p) => p.seat),
  ).slice(0, 4);
  const types = shuffle(ctx.rng, ['birth', 'country', 'birth', 'country'] as const);
  const questions: Question[] = questionSeats.map((seat, i) => ({
    id: i + 1,
    seat,
    type: types[i],
    solved: false,
    lastAttemptRound: null,
  }));

  const state: GameState = {
    version: 2,
    round: 1,
    status: 'playing',
    winner: null,
    players,
    characters,
    citizenVerifyUses: dist.citizenVerifyUses,
    arc: null,
    initialPicks: Object.fromEntries(players.filter((p) => p.role === 'killer').map((p) => [p.id, null])),
    attacks: [],
    nextAttackId: 1,
    killerTargets: {},
    killerPlans: {},
    policeShotsLeft: Object.fromEntries(players.filter((p) => p.role === 'police').map((p) => [p.id, POLICE_SHOTS])),
    policeShots: [],
    accusations: [],
    investigation: {
      questions,
      hints: generateHints(charOf(killerA), charOf(killerB)),
      hintsUnlocked: 0,
      verifications: [],
    },
    citizens: Object.fromEntries(
      players
        .filter((p) => p.role === 'citizen')
        .map((p) => [
          p.id,
          {
            checkUses: CITIZEN_CHECK_USES,
            verifyUses: dist.citizenVerifyUses,
            sabotageUsed: false,
            lastCheckRound: null,
            lastVerifyRound: null,
          },
        ]),
    ),
    sabotages: [],
    cards: {},
    results: {},
    announcements: [],
    maniacWon: [],
    usedRiddles: {},
  };
  startRound(state, ctx);
  return state;
}
