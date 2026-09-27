'use client';

import Link from 'next/link';
import type { PrivateData, PublicData, RoomRow } from '@/lib/client/types';
import { Logo } from './Logo';

const TITLE: Record<string, string> = {
  killers: 'Os assassinos venceram',
  good: 'O grupo do bem venceu',
  none: 'Partida encerrada pelo host',
};

export function EndScreen({ room, pub, priv, viewerId }: { room: RoomRow; pub: PublicData; priv: PrivateData; viewerId: string }) {
  const maniacWon = priv.secret?.data.maniacWon;
  const maniacs = pub.reveal.filter((r) => r.role === 'maniac');
  const maniacDead = new Set(pub.announcements.filter((a) => a.kind === 'death').map((a) => a.player_id));

  return (
    <main className="flex flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <Logo small />
      <section className={`panel mt-6 text-center ${room.winner === 'killers' ? 'border-accent/50' : room.winner === 'good' ? 'border-emerald-500/50' : ''}`}>
        <p className="label">Fim de jogo</p>
        <p className="mt-2 text-3xl font-black">{TITLE[room.winner ?? 'none']}</p>
        {maniacWon && <p className="mt-3 font-bold text-emerald-300">E você venceu como Maníaco!</p>}
        {!maniacWon && maniacs.some((m) => maniacDead.has(m.player_id)) && room.winner !== 'none' && (
          <p className="mt-3 text-sm text-zinc-400">O Maníaco também conseguiu o que queria.</p>
        )}
      </section>

      <section className="panel mt-4">
        <h2 className="label mb-2">Revelação</h2>
        {pub.reveal.length === 0 ? (
          <p className="text-sm text-zinc-500">Nada a revelar.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-800">
            {pub.reveal.map((r) => (
              <li key={r.player_id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-7 text-right font-mono font-bold text-zinc-400">{r.seat}</span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${r.player_id === viewerId ? 'text-accent-soft' : ''}`}>{r.name}</p>
                  <p className="truncate text-xs text-zinc-400">{r.character_name}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${r.role === 'killer' ? 'text-accent-soft' : r.role === 'maniac' ? 'text-amber-300' : 'text-zinc-100'}`}>{r.role_label}</p>
                  <p className="text-xs text-zinc-500">{r.status === 'alive' ? 'vivo' : r.status === 'dead' ? 'morto' : 'preso'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/" className="btn-primary mt-6">
        Nova partida
      </Link>
    </main>
  );
}
