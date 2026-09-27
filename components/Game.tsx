'use client';

import { useEffect, useRef, useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { AnnouncementRow, PrivateData, PublicData, RoomRow } from '@/lib/client/types';
import { formatClock, useCountdown } from '@/lib/client/useCountdown';
import { HostPanel } from './HostPanel';
import { MissionCard } from './MissionCard';
import { SheetTab } from './SheetTab';
import { TableTab } from './TableTab';
import { TurnModal } from './TurnModal';

type Tab = 'round' | 'sheet' | 'table';

export function Game({
  code,
  room,
  pub,
  priv,
  myId,
  viewerId,
  isHost,
  isOriginalHost,
}: {
  code: string;
  room: RoomRow;
  pub: PublicData;
  priv: PrivateData;
  myId: string;
  viewerId: string;
  isHost: boolean;
  isOriginalHost: boolean;
}) {
  const [tab, setTab] = useState<Tab>('round');
  const { remainingMs, paused, expired } = useCountdown(room);
  const viewer = pub.players.find((p) => p.id === viewerId);
  const alive = viewer?.status === 'alive';

  // Virada de rodada: qualquer cliente chama o tick quando o tempo acaba (idempotente).
  const lastTick = useRef(0);
  useEffect(() => {
    if (!expired || paused) return;
    const now = Date.now();
    if (now - lastTick.current < 4000) return;
    lastTick.current = now;
    const jitter = Math.random() * 800;
    const t = setTimeout(() => roomApi(code, 'tick').catch(() => {}), jitter);
    return () => clearTimeout(t);
  }, [expired, paused, code, remainingMs]);

  // Anúncios da virada: aparecem quando a rodada avança enquanto a tela está aberta.
  const seenRound = useRef<number | null>(null);
  const [turn, setTurn] = useState<{ round: number; items: AnnouncementRow[] } | null>(null);
  useEffect(() => {
    if (seenRound.current === null) {
      seenRound.current = room.current_round;
      return;
    }
    if (room.current_round > seenRound.current) {
      const finished = seenRound.current;
      seenRound.current = room.current_round;
      setTurn({ round: finished, items: [] });
      setTab('round');
    }
  }, [room.current_round]);
  const turnItems = turn ? pub.announcements.filter((a) => a.round === turn.round) : [];

  const cards = priv.cards.filter((c) => c.round === room.current_round && c.status !== 'gone');
  const seat = viewer?.seat ?? priv.secret?.data.seat;
  const maniacWon = priv.secret?.data.maniacWon;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Rodada</p>
            <p className="text-2xl font-black">{room.current_round}</p>
          </div>
          <div className="text-center">
            <p className={`font-mono text-4xl font-black tabular-nums ${paused ? 'text-amber-300' : remainingMs < 30_000 ? 'text-accent' : 'text-white'}`}>
              {formatClock(remainingMs)}
            </p>
            <p className="text-xs text-zinc-400">{paused ? 'pausado' : expired ? 'virando a rodada…' : 'restante'}</p>
          </div>
          <div className="text-right">
            <p className="label">Você é o</p>
            <p className="text-2xl font-black">nº {seat ?? '–'}</p>
          </div>
        </div>
        <nav className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-ink-900 p-1">
          {(
            [
              ['round', 'Rodada'],
              ['sheet', 'Minha ficha'],
              ['table', 'Mesa'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg py-2 text-sm font-semibold ${tab === t ? 'bg-ink-700 text-white' : 'text-zinc-400'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-32">
        {!alive && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <p className="font-bold">Você está fora do jogo.</p>
            <p className="mt-1 text-red-200/80">Modo espectador: não fale, não reaja e não dê pistas até o fim da partida.</p>
            {maniacWon && <p className="mt-3 font-bold text-emerald-300">Você venceu como Maníaco!</p>}
          </div>
        )}

        {tab === 'round' && alive && (
          <>
            {paused && <Notice>Partida pausada pelo host.</Notice>}
            {expired && !paused && <Notice>Tempo esgotado. As ações estão travadas até a virada.</Notice>}
            {cards.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">Carregando missões…</p>}
            {cards.map((c) => (
              <MissionCard
                key={`${c.round}-${c.slot}`}
                code={code}
                card={c}
                locked={paused || expired}
                actAs={viewerId !== myId ? viewerId : null}
              />
            ))}
          </>
        )}
        {tab === 'round' && !alive && <p className="py-6 text-center text-sm text-zinc-500">Sem ações para espectadores.</p>}
        {tab === 'sheet' && <SheetTab priv={priv} viewerId={viewerId} roomId={room.id} />}
        {tab === 'table' && <TableTab players={pub.players} announcements={pub.announcements} viewerId={viewerId} />}
      </main>

      {isHost && <HostPanel code={code} room={room} players={pub.players} isOriginalHost={isOriginalHost} />}
      {turn && <TurnModal round={turn.round} items={turnItems} onClose={() => setTurn(null)} />}
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{children}</p>;
}
