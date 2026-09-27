import { describe, expect, it } from 'vitest';
import { computeActingHost, type PresencePlayer } from '../host';

const now = 1_000_000;
const P = (id: string, seat: number | null, lastSeenAgo: number | null, extra: Partial<PresencePlayer> = {}): PresencePlayer => ({
  id,
  seat,
  status: 'alive',
  isBot: false,
  joinedAt: seat ?? 0,
  lastSeenAt: lastSeenAgo === null ? null : now - lastSeenAgo,
  ...extra,
});

describe('host efetivo', () => {
  it('host original conectado mantém os controles', () => {
    const players = [P('h', 5, 50_000), P('a', 1, 1_000)];
    expect(computeActingHost({ hostId: 'h', currentActingId: 'h', inLobby: false, players }, now)).toBe('h');
  });

  it('após 60 s, passa para o vivo conectado com menor número', () => {
    const players = [P('h', 1, 61_000), P('a', 4, 1_000), P('b', 2, 1_000, { status: 'dead' }), P('c', 3, 45_000), P('bot', 2, 0, { isBot: true })];
    expect(computeActingHost({ hostId: 'h', currentActingId: 'h', inLobby: false, players }, now)).toBe('a');
  });

  it('host original volta e recupera os controles', () => {
    const players = [P('h', 9, 2_000), P('a', 1, 1_000)];
    expect(computeActingHost({ hostId: 'h', currentActingId: 'a', inLobby: false, players }, now)).toBe('h');
  });

  it('no lobby usa a ordem de entrada', () => {
    const players = [P('h', null, 90_000), P('x', null, 1_000, { joinedAt: 30 }), P('y', null, 1_000, { joinedAt: 20 })];
    expect(computeActingHost({ hostId: 'h', currentActingId: 'h', inLobby: true, players }, now)).toBe('y');
  });

  it('ninguém conectado: mantém o atual', () => {
    const players = [P('h', 1, 90_000), P('a', 2, 90_000)];
    expect(computeActingHost({ hostId: 'h', currentActingId: 'a', inLobby: false, players }, now)).toBe('a');
  });
});
