'use client';

import { useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { PlayerRow, RoomRow } from '@/lib/client/types';

/** Modo de teste (só em desenvolvimento): bots e troca de visão. */
export function DevBar({
  code,
  room,
  players,
  myId,
  viewAs,
  setViewAs,
}: {
  code: string;
  room: RoomRow;
  players: PlayerRow[];
  myId: string;
  viewAs: string;
  setViewAs: (id: string | null) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (op: string, body: unknown = {}) => {
    setMsg(null);
    try {
      await roomApi(code, op, body);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };
  const viewable = players.filter((p) => p.id === myId || p.is_bot);

  return (
    <div className="sticky top-0 z-30 border-b border-amber-500/30 bg-amber-950/90 px-3 py-2 text-xs text-amber-100 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">TESTE</span>
        {room.status !== 'lobby' && (
          <select
            className="min-w-0 flex-1 rounded-md border border-amber-500/40 bg-amber-950 px-2 py-1"
            value={viewAs}
            onChange={(e) => setViewAs(e.target.value === myId ? null : e.target.value)}
          >
            {viewable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.seat ? `nº ${p.seat} · ` : ''}
                {p.name}
                {p.id === myId ? ' (você)' : ''}
              </option>
            ))}
          </select>
        )}
        {room.status === 'lobby' && (
          <>
            <button className="rounded-md bg-amber-500/20 px-2 py-1 font-semibold" onClick={() => run('dev-bots', { count: 1 })}>
              +1 bot
            </button>
            <button
              className="rounded-md bg-amber-500/20 px-2 py-1 font-semibold"
              onClick={() => run('dev-bots', { count: Math.max(1, 10 - players.length) })}
            >
              Completar 10
            </button>
            <button className="rounded-md bg-amber-500/20 px-2 py-1 font-semibold" onClick={() => run('dev-bots', { count: 20 - players.length })}>
              Completar 20
            </button>
          </>
        )}
        {room.status === 'playing' && (
          <button className="rounded-md bg-amber-500/20 px-2 py-1 font-semibold" onClick={() => run('dev-force-end')}>
            Forçar fim da rodada
          </button>
        )}
      </div>
      {msg && <p className="mt-1 text-red-300">{msg}</p>}
    </div>
  );
}
