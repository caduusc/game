export type Role = 'killer' | 'investigator' | 'police' | 'citizen' | 'maniac';
export type PlayerStatus = 'alive' | 'dead' | 'arrested';
export type Gender = 'M' | 'F';
export type Origin = 'BR' | 'EX';
export type Century = 'XIX' | 'XX';
export type KillerSlot = 'A' | 'B';
export type Winner = 'killers' | 'good' | 'none';

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

export interface GamePlayer {
  id: string;
  name: string;
  seat: number;
  role: Role;
  characterId: string;
  killerSlot: KillerSlot | null;
  status: PlayerStatus;
}

export type Fields = 'text' | 'number' | 'number_text';

export type CardKind =
  | 'decoy'
  | 'killer_initial'
  | 'killer_choose'
  | 'killer_weapon'
  | 'inv_question'
  | 'inv_verify'
  | 'inv_accuse'
  | 'police_shot'
  | 'citizen_check'
  | 'citizen_verify';

export interface DecoyStep {
  prompt: string;
  fields: Fields;
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
}

export interface CardInput {
  number?: number | null;
  text?: string | null;
}

export type QuestionType = 'birth' | 'country';

export interface Question {
  id: number;
  seat: number;
  type: QuestionType;
  solved: boolean;
  lastAttemptRound: number | null;
}

export interface Target {
  seat: number;
  side: 'L' | 'R' | 'P';
}

export interface Arc {
  l: number;
  r: number;
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
  lastCheckRound: number | null;
  lastVerifyRound: number | null;
}

export interface PrivateResult {
  round: number;
  kind: 'check' | 'verify';
  text: string;
}

export interface Announcement {
  round: number;
  playerId: string;
  name: string;
  seat: number;
  kind: 'death' | 'arrest';
  characterName: string;
}

export interface GameState {
  round: number;
  status: 'playing' | 'finished';
  winner: Winner | null;
  players: GamePlayer[];
  characters: Character[];
  citizenVerifyUses: number;
  arc: Arc | null;
  pending: number[];
  initialTarget: number | null;
  choice: Target[] | null;
  /** Rodada 2+: resposta de arma por assento-alvo nesta rodada. */
  weaponAnswers: Record<string, { by: string; answer: string }>;
  policeShots: { by: string; seat: number; correct: boolean }[];
  accusations: { by: string; seat: number; round: number }[];
  investigation: {
    questions: Question[];
    hints: string[];
    hintsUnlocked: number;
    verifications: Verification[];
  };
  citizens: Record<string, CitizenState>;
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
}

export class GameError extends Error {}
