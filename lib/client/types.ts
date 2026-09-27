import type { CardView, InvestigatorsTeamView, KillersTeamView, SecretData } from '@/lib/engine';

export interface RoomRow {
  id: string;
  code: string;
  host_player_id: string | null;
  acting_host_player_id: string | null;
  status: 'lobby' | 'playing' | 'finished';
  round_minutes: number;
  current_round: number;
  ends_at: string | null;
  paused_remaining_ms: number | null;
  resolved_round: number;
  winner: 'killers' | 'good' | 'none' | null;
  dev_mode: boolean;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string | null;
  name: string;
  seat: number | null;
  status: 'alive' | 'dead' | 'arrested';
  is_bot: boolean;
  joined_at: string;
  last_seen_at: string | null;
}

export interface AnnouncementRow {
  room_id: string;
  round: number;
  player_id: string;
  kind: 'death' | 'arrest';
  name: string;
  seat: number;
  character_name: string;
}

export interface RevealRow {
  player_id: string;
  name: string;
  seat: number;
  role: string;
  role_label: string;
  character_name: string;
  status: string;
}

export interface SecretRow {
  player_id: string;
  role: string;
  role_label: string;
  character_name: string;
  data: SecretData;
}

export type CardRow = CardView & { player_id: string };

export interface ResultRow {
  player_id: string;
  idx: number;
  round: number;
  kind: 'check' | 'verify';
  text: string;
}

export interface TeamStateRow {
  team: 'killers' | 'investigators';
  data: KillersTeamView | InvestigatorsTeamView;
}

export interface PublicData {
  room: RoomRow | null;
  players: PlayerRow[];
  announcements: AnnouncementRow[];
  reveal: RevealRow[];
}

export interface PrivateData {
  secret: SecretRow | null;
  cards: CardRow[];
  results: ResultRow[];
  killers: KillersTeamView | null;
  investigators: InvestigatorsTeamView | null;
}

export interface Identity {
  playerId: string;
  roomId: string;
  isOriginalHost: boolean;
  devTools: boolean;
}
