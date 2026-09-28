export type Role = 'killer' | 'investigator' | 'police' | 'citizen' | 'maniac';
export type PlayerStatus = 'alive' | 'dead' | 'arrested';
export type Gender = 'M' | 'F';
export type Origin = 'BR' | 'EX';
export type Century = 'XIX' | 'XX';
export type KillerSlot = 'A' | 'B';
export type Winner = 'killers' | 'good' | 'none';
export type Side = 'L' | 'R';

export interface Character {
  id: string;
  name: string;
  /** ISO YYYY-MM-DD */
  birth: string;
  country: string;
  gender: Gender;
  origin: Origin;
  century: Century;
  area: string;
  weapon: string;
  /** Formas aceitas para identificar o personagem (além do nome completo). */
  aliases: string[];
  /** Formas aceitas para a arma (além do nome da arma). */
  weaponAliases: string[];
}

export interface Riddle {
  id: number;
  question: string;
  /** Respostas aceitas; a primeira é a canônica. */
  answers: string[];
}

/** Pergunta de múltipla escolha (sabotagem). */
export interface QuizQuestion {
  id: number;
  question: string;
  /** Exatamente 4 opções. */
  options: string[];
  /** Índice da opção correta (0-3). */
  answer: number;
}

export interface GamePlayer {
  id: string;
  name: string;
  seat: number;
  role: Role;
  characterId: string;
  killerSlot: KillerSlot | null;
  status: PlayerStatus;
}

/**
 * Tipos de entrada de um card:
 * - text: campo de texto
 * - choice: escolher uma opção (botões ou lista)
 * - choice_text: escolher uma opção e digitar um texto
 */
export type Fields = 'text' | 'choice' | 'choice_text';

export interface CardOption {
  value: string;
  label: string;
}

export type CardKind =
  | 'decoy'
  | 'killer_initial'
  | 'killer_action'
  | 'inv_question'
  | 'inv_verify'
  | 'inv_accuse'
  | 'police_shot'
  | 'citizen_check'
  | 'citizen_verify';

export interface DecoyStep {
  prompt: string;
  fields: Fields;
  /** 'seats' = lista de jogadores vivos montada na hora. */
  options?: CardOption[] | 'seats';
  skipLabel?: string;
}

export interface Card {
  slot: number;
  kind: CardKind;
  step: number;
  done: boolean;
  attempts: number;
  feedback: string | null;
  riddle?: Riddle;
  decoySteps?: DecoyStep[];
  /** Cidadão: 3 perguntas oferecidas para sabotar. */
  quiz?: QuizQuestion[];
  /** Cidadão: número escolhido para sabotar (passo intermediário). */
  sabotageSeat?: number;
}

export interface CardInput {
  choice?: string | null;
  text?: string | null;
  skip?: boolean;
}

export type QuestionType = 'birth' | 'country';

export interface Question {
  id: number;
  seat: number;
  type: QuestionType;
  solved: boolean;
  lastAttemptRound: number | null;
}

export interface Arc {
  l: number;
  r: number;
}

/** Ataque dos assassinos em andamento: escolhido na rodada X, resolve na virada X+1 → X+2. */
export interface Attack {
  id: number;
  killerId: string | null;
  seat: number;
  side: Side | null;
  /** null = ataque automático (alvo inicial). */
  weapon: string | null;
  chosenRound: number;
  resolvesAfterRound: number;
  /** Assento original, se o alvo foi transferido por sabotagem. */
  sabotagedFrom: number | null;
}

/** Alvo guardado por um assassino para as próximas rodadas. */
export interface KillerTarget {
  seat: number;
  side: Side | null;
  kind: 'reserved' | 'obligatory';
}

/** Plano do assassino na rodada atual. */
export interface KillerPlan {
  side: Side | null;
  seat: number | null;
  done: boolean;
  summary: string | null;
}

export interface Verification {
  round: number;
  by: string;
  seat: number;
  declared: string;
  truth: boolean;
}

export interface CitizenState {
  checkUses: number;
  verifyUses: number;
  sabotageUsed: boolean;
  lastCheckRound: number | null;
  lastVerifyRound: number | null;
}

export interface PrivateResult {
  round: number;
  kind: 'check' | 'verify' | 'sabotage';
  text: string;
}

export interface Sabotage {
  id: number;
  round: number;
  by: string;
  bySeat: number;
  targetId: string;
  targetSeat: number;
  question: QuizQuestion;
  status: 'pending' | 'open' | 'success' | 'failed';
  /** ms epoch em que o sabotado abriu a pergunta. */
  openedAt: number | null;
  announced: boolean;
}

export type Announcement =
  | { kind: 'death' | 'arrest'; round: number; playerId: string; name: string; seat: number; characterName: string }
  | { kind: 'targeted'; round: number; count: number }
  | { kind: 'sabotage_ok'; round: number; seat: number }
  | { kind: 'sabotage_fail'; round: number };

export interface GameState {
  version: 2;
  round: number;
  status: 'playing' | 'finished';
  winner: Winner | null;
  players: GamePlayer[];
  characters: Character[];
  citizenVerifyUses: number;
  arc: Arc | null;
  /** Rodada 1: escolha de cada assassino. */
  initialPicks: Record<string, number | null>;
  attacks: Attack[];
  nextAttackId: number;
  killerTargets: Record<string, KillerTarget | null>;
  killerPlans: Record<string, KillerPlan>;
  policeShotsLeft: Record<string, number>;
  policeShots: { by: string; seat: number }[];
  accusations: { by: string; seat: number; round: number }[];
  investigation: {
    questions: Question[];
    hints: string[];
    hintsUnlocked: number;
    verifications: Verification[];
  };
  citizens: Record<string, CitizenState>;
  sabotages: Sabotage[];
  cards: Record<string, Card[]>;
  results: Record<string, PrivateResult[]>;
  announcements: Announcement[];
  maniacWon: string[];
  usedRiddles: Record<string, number[]>;
}

export interface Rng {
  next(): number;
}

export interface EngineContext {
  rng: Rng;
  riddles: Riddle[];
  quiz: QuizQuestion[];
  /** ms epoch (sabotagem com cronômetro). */
  now: number;
}

export class GameError extends Error {}
