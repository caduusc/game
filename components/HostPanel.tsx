'use client';

import { useEffect, useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { PlayerRow, RoomRow } from '@/lib/client/types';
import { isOnline } from '@/lib/client/useCountdown';

export function HostPanel({ code, room, players, isOriginalHost }: { code: string; room: RoomRow; players: PlayerRow[]; isOriginalHost: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejoin, setRejoin] = useState<{ code: string; name: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const paused = room.paused_remaining_ms !== null;

  useEffect(() => {
    if (!rejoin) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rejoin]);

  const run = async (op: string, body: unknown = {}) => {
    setError(null);
    try {
      return await roomApi(code, op, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
      return null;
    }
  };

  async function makeRejoin(playerId: string) {
    const res = (await run('rejoin-code', { playerId })) as { rejoinCode: string; expiresAt: number; playerName: string } | null;
    if (res) setRejoin({ code: res.rejoinCode, name: res.playerName, expiresAt: res.expiresAt });
  }

  const humans = players.filter((p) => !p.is_bot && p.seat !== null).sort((a, b) => a.seat! - b.seat!);
  const left = rejoin ? Math.max(0, rejoin.expiresAt - now) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="rounded-2xl border border-ink-600 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-accent/15 px-2 py-1 text-xs font-bold text-accent-soft">{isOriginalHost ? 'HOST' : 'HOST TEMPORÁRIO'}</span>
          <button className="btn-ghost flex-1 py-2 text-sm" onClick={() => run(paused ? 'resume' : 'pause')}>
            {paused ? 'Retomar' : 'Pausar'}
          </button>
          <button className="btn-ghost py-2 text-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Fechar' : 'Mais'}
          </button>
        </div>

        {open && (
          <div className="mt-3 flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
            <div>
              <p className="label">Liberar reentrada</p>
              <p className="mt-1 text-xs text-zinc-500">Gera um código de uso único (10 min) que liga um novo navegador ao lugar do jogador.</p>
              {rejoin && left > 0 && (
                <div className="mt-2 rounded-xl bg-ink-800 p-3 text-center">
                  <p className="text-xs text-zinc-400">Código para {rejoin.name}</p>
                  <p className="font-mono text-3xl font-black tracking-[0.3em]">{rejoin.code}</p>
                  <p className="text-xs text-zinc-500">
                    expira em {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
                  </p>
                </div>
              )}
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {humans.map((p) => (
                  <li key={p.id}>
                    <button className="btn-ghost w-full justify-start py-2 text-left text-sm" onClick={() => makeRejoin(p.id)}>
                      <span className={`size-2 shrink-0 rounded-full ${isOnline(p.last_seen_at) ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <span className="truncate">
                        {p.seat} · {p.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {confirmEnd ? (
                <div className="flex gap-2">
                  <button className="btn flex-1 bg-red-600 py-2 text-sm text-white" onClick={() => run('end')}>
                    Confirmar encerramento
                  </button>
                  <button className="btn-ghost py-2 text-sm" onClick={() => setConfirmEnd(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button className="btn-ghost w-full py-2 text-sm text-red-300" onClick={() => setConfirmEnd(true)}>
                  Encerrar partida
                </button>
              )}
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
