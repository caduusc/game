/** Regras de presença e de host efetivo (puras, sem banco). */

export const HOST_TIMEOUT_MS = 60_000;
export const CONNECTED_WINDOW_MS = 30_000;

export interface PresencePlayer {
  id: string;
  seat: number | null;
  status: 'alive' | 'dead' | 'arrested';
  isBot: boolean;
  joinedAt: number;
  lastSeenAt: number | null;
}

export function isConnected(p: PresencePlayer, now: number, windowMs = CONNECTED_WINDOW_MS): boolean {
  return !p.isBot && p.lastSeenAt !== null && now - p.lastSeenAt <= windowMs;
}

/**
 * Host efetivo:
 * - o host original, se foi visto nos últimos 60 s;
 * - senão, o jogador vivo e conectado com o menor número (no lobby, o que entrou primeiro);
 * - sem ninguém conectado, mantém o host efetivo atual.
 */
export function computeActingHost(
  input: { hostId: string; currentActingId: string | null; inLobby: boolean; players: PresencePlayer[] },
  now: number,
): string {
  const host = input.players.find((p) => p.id === input.hostId);
  if (host && host.lastSeenAt !== null && now - host.lastSeenAt <= HOST_TIMEOUT_MS) return host.id;
  const candidates = input.players
    .filter((p) => isConnected(p, now) && (input.inLobby || p.status === 'alive'))
    .sort((a, b) =>
      input.inLobby || a.seat === null || b.seat === null ? a.joinedAt - b.joinedAt : a.seat - b.seat,
    );
  return candidates[0]?.id ?? input.currentActingId ?? input.hostId;
}
