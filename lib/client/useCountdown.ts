'use client';

import { useEffect, useState } from 'react';
import { serverNow } from './clock';
import type { RoomRow } from './types';

/** Tempo restante da rodada, usando a hora do servidor. */
export function useCountdown(room: RoomRow | null) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, []);
  if (!room || room.status !== 'playing') return { remainingMs: 0, paused: false, expired: false };
  if (room.paused_remaining_ms !== null) return { remainingMs: room.paused_remaining_ms, paused: true, expired: false };
  const endsAt = room.ends_at ? new Date(room.ends_at).getTime() : now;
  const remainingMs = Math.max(0, endsAt - now);
  return { remainingMs, paused: false, expired: remainingMs <= 0 };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Conectado = heartbeat nos últimos 30 s. */
export function isOnline(lastSeenAt: string | null): boolean {
  return lastSeenAt !== null && serverNow() - new Date(lastSeenAt).getTime() <= 30_000;
}
