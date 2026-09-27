'use client';

import { useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { PlayerRow, RoomRow } from '@/lib/client/types';
import { isOnline } from '@/lib/client/useCountdown';
import { Logo } from './Logo';

const MIN = 10;
const MAX = 20;

export function Lobby({
  code,
  room,
  players,
  myId,
  isHost,
}: {
  code: string;
  room: RoomRow;
  players: PlayerRow[];
  myId: string;
  isHost: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const count = players.length;
  const canStart = count >= MIN && count <= MAX;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await roomApi(code, 'start');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar.');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = `${location.origin}/?code=${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Alergia', text: `Entre na sala ${code} do Alergia`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }

  return (
    <main className="flex flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <Logo small />
      <section className="panel mt-6 text-center">
        <p className="label">Código da sala</p>
        <p className="mt-1 text-6xl font-black tracking-[0.25em] text-white">{code}</p>
        <button onClick={share} className="mt-3 text-sm font-semibold text-accent-soft">
          {copied ? 'Link copiado!' : 'Compartilhar convite'}
        </button>
        <p className="mt-2 text-xs text-zinc-500">Rodadas de {room.round_minutes} min</p>
      </section>

      <section className="mt-4 flex items-baseline justify-between">
        <h2 className="label">Jogadores</h2>
        <span className={`text-sm font-semibold ${canStart ? 'text-emerald-400' : 'text-zinc-400'}`}>
          {count}/{MAX}
        </span>
      </section>
      <ul className="mt-2 flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-3">
            <span className={`size-2.5 rounded-full ${p.is_bot || isOnline(p.last_seen_at) ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="flex-1 truncate font-medium">
              {p.name}
              {p.id === myId && <span className="text-zinc-500"> (você)</span>}
            </span>
            {p.id === room.host_player_id && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent-soft">HOST</span>}
            {p.is_bot && <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">BOT</span>}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        {isHost ? (
          <>
            <button className="btn-primary w-full" disabled={!canStart || busy} onClick={start}>
              {busy ? 'Sorteando…' : 'Iniciar partida'}
            </button>
            {!canStart && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {count < MIN ? `Faltam ${MIN - count} jogador(es) para o mínimo de ${MIN}.` : `Máximo de ${MAX} jogadores.`}
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-zinc-400">Aguardando o host iniciar a partida…</p>
        )}
      </div>
    </main>
  );
}
