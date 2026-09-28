import { SIDE_LABEL, tentativeTargets } from './arc';
import { CARDS_PER_ROUND, characterOf, renderCard, sabotageView, type CardView } from './cards';
import type { Announcement, GamePlayer, GameState, KillerSlot, PlayerStatus, PrivateResult, Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  killer: 'Assassino',
  investigator: 'Investigador',
  police: 'Policial',
  citizen: 'Cidadão',
  maniac: 'Maníaco',
};

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface CharacterSheet {
  name: string;
  birth: string;
  country: string;
  gender: string;
  origin: string;
  century: string;
  area: string;
  weapon: string;
}

export interface SecretData {
  seat: number;
  status: PlayerStatus;
  character: CharacterSheet;
  killerSlot?: KillerSlot;
  checkUses?: number;
  verifyUses?: number;
  accusationUsed?: boolean;
  maniacWon?: boolean;
  policeShotsLeft?: number;
  sabotageUsed?: boolean;
  /** Sabotagem recebida, aguardando resposta. */
  sabotage?: ReturnType<typeof sabotageView>;
}

export interface SecretView {
  role: Role;
  roleLabel: string;
  characterName: string;
  data: SecretData;
}

export interface KillersTeamView {
  members: { name: string; seat: number; slot: KillerSlot; status: PlayerStatus }[];
  characters: { name: string; weapon: string }[];
  round: number;
  initialPicks: { slot: KillerSlot; seat: number | null }[];
  plans: { slot: KillerSlot; text: string }[];
  attacks: { slot: KillerSlot | null; seat: number; weapon: string | null; diesOnTurnTo: number }[];
  saved: { slot: KillerSlot; seat: number; kind: 'reserved' | 'obligatory' }[];
}

export interface InvestigatorsTeamView {
  members: { name: string; seat: number; status: PlayerStatus }[];
  characterNames: string[];
  questions: { seat: number; type: string; solved: boolean; triedThisRound: boolean }[];
  hints: string[];
  verifications: { round: number; seat: number; declared: string; truth: boolean; byName: string }[];
  accusations: { round: number; seat: number; byName: string }[];
}

export interface RevealRow {
  playerId: string;
  name: string;
  seat: number;
  role: Role;
  roleLabel: string;
  characterName: string;
  status: PlayerStatus;
}

export interface Projection {
  players: Record<string, { seat: number; status: PlayerStatus }>;
  secrets: Record<string, SecretView>;
  cards: Record<string, CardView[]>;
  results: Record<string, PrivateResult[]>;
  teams: {
    killers: { members: string[]; data: KillersTeamView };
    investigators: { members: string[]; data: InvestigatorsTeamView };
  };
  announcements: Announcement[];
  reveal: RevealRow[] | null;
}

function sheet(state: GameState, p: GamePlayer): CharacterSheet {
  const ch = characterOf(state, p);
  return {
    name: ch.name,
    birth: formatDate(ch.birth),
    country: ch.country,
    gender: ch.gender === 'M' ? 'Homem' : 'Mulher',
    origin: ch.origin === 'BR' ? 'Brasil' : 'Exterior',
    century: ch.century,
    area: ch.area,
    weapon: ch.weapon,
  };
}

function goneCards(round: number): CardView[] {
  return Array.from({ length: CARDS_PER_ROUND }, (_, i) => ({
    slot: i + 1,
    round,
    step: 0,
    title: `Missão ${i + 1}`,
    prompt: '',
    fields: 'text' as const,
    options: null,
    skipLabel: null,
    status: 'gone' as const,
    feedback: null,
  }));
}

/** Tudo que cada jogador/equipe pode ver, derivado do estado completo. */
export function project(state: GameState): Projection {
  const players: Projection['players'] = {};
  const secrets: Projection['secrets'] = {};
  const cards: Projection['cards'] = {};
  const results: Projection['results'] = {};

  for (const p of state.players) {
    players[p.id] = { seat: p.seat, status: p.status };
    const data: SecretData = { seat: p.seat, status: p.status, character: sheet(state, p) };
    if (p.role === 'killer' && p.killerSlot) data.killerSlot = p.killerSlot;
    if (p.role === 'citizen') {
      data.checkUses = state.citizens[p.id]?.checkUses ?? 0;
      data.verifyUses = state.citizens[p.id]?.verifyUses ?? 0;
    }
    if (p.role === 'investigator') data.accusationUsed = state.accusations.some((a) => a.by === p.id);
    if (p.role === 'maniac') data.maniacWon = state.maniacWon.includes(p.id);
    if (p.role === 'police') data.policeShotsLeft = state.policeShotsLeft[p.id] ?? 0;
    if (p.role === 'citizen') data.sabotageUsed = state.citizens[p.id]?.sabotageUsed ?? false;
    data.sabotage = sabotageView(state, p.id, true);
    secrets[p.id] = { role: p.role, roleLabel: ROLE_LABEL[p.role], characterName: characterOf(state, p).name, data };

    const own = state.cards[p.id] ?? [];
    cards[p.id] = own.length ? own.map((c) => renderCard(state, p, c)) : goneCards(state.round);
    results[p.id] = state.results[p.id] ?? [];
  }

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const killers = state.players.filter((p) => p.role === 'killer');
  const investigators = state.players.filter((p) => p.role === 'investigator');

  const slotOf = new Map(killers.map((k) => [k.id, k.killerSlot!]));
  const tentative = state.status === 'playing' ? tentativeTargets(state) : {};
  const killersView: KillersTeamView = {
    members: killers.map((k) => ({ name: k.name, seat: k.seat, slot: k.killerSlot!, status: k.status })),
    characters: state.characters
      .map((c) => ({ name: c.name, weapon: c.weapon }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    round: state.round,
    initialPicks: killers.map((k) => ({ slot: k.killerSlot!, seat: state.initialPicks[k.id] ?? null })),
    plans: killers
      .filter((k) => k.status === 'alive' && state.round >= 2)
      .map((k) => {
        const plan = state.killerPlans[k.id];
        const saved = state.killerTargets[k.id];
        const t = tentative[k.id];
        let text: string;
        if (plan?.done) text = plan.summary ?? 'ação registrada';
        else if (saved) text = `alvo ${saved.kind === 'obligatory' ? 'obrigatório' : 'reservado'} nº ${saved.seat}, falta escolher a arma`;
        else if (plan?.side && t) text = `${SIDE_LABEL[plan.side]} → nº ${t.seat}, falta escolher a arma`;
        else text = 'ainda não escolheu';
        return { slot: k.killerSlot!, text };
      }),
    // Os assassinos não ficam sabendo de sabotagens: mostram sempre o alvo original.
    attacks: state.attacks.map((a) => ({
      slot: a.killerId ? (slotOf.get(a.killerId) ?? null) : null,
      seat: a.sabotagedFrom ?? a.seat,
      weapon: a.weapon,
      diesOnTurnTo: a.resolvesAfterRound + 1,
    })),
    saved: killers
      .filter((k) => state.killerTargets[k.id])
      .map((k) => ({ slot: k.killerSlot!, seat: state.killerTargets[k.id]!.seat, kind: state.killerTargets[k.id]!.kind })),
  };

  const inv = state.investigation;
  const investigatorsView: InvestigatorsTeamView = {
    members: investigators.map((p) => ({ name: p.name, seat: p.seat, status: p.status })),
    characterNames: state.characters.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    questions: inv.questions.map((q) => ({
      seat: q.seat,
      type: q.type === 'birth' ? 'data de nascimento' : 'país',
      solved: q.solved,
      triedThisRound: q.lastAttemptRound === state.round,
    })),
    hints: inv.hints.slice(0, inv.hintsUnlocked),
    verifications: inv.verifications.map((v) => ({
      round: v.round,
      seat: v.seat,
      declared: v.declared,
      truth: v.truth,
      byName: nameOf(v.by),
    })),
    accusations: state.accusations
      .filter((a) => investigators.some((p) => p.id === a.by))
      .map((a) => ({ round: a.round, seat: a.seat, byName: nameOf(a.by) })),
  };

  const reveal: RevealRow[] | null =
    state.status === 'finished'
      ? state.players.map((p) => ({
          playerId: p.id,
          name: p.name,
          seat: p.seat,
          role: p.role,
          roleLabel: ROLE_LABEL[p.role],
          characterName: characterOf(state, p).name,
          status: p.status,
        }))
      : null;

  return {
    players,
    secrets,
    cards,
    results,
    teams: {
      killers: { members: killers.map((k) => k.id), data: killersView },
      investigators: { members: investigators.map((p) => p.id), data: investigatorsView },
    },
    announcements: state.announcements,
    reveal,
  };
}
