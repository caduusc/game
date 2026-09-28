'use client';

import type { AnnouncementRow, PlayerRow } from '@/lib/client/types';
import { announcementText } from '@/lib/client/announcements';
import { isOnline } from '@/lib/client/useCountdown';

/** "Mesa": o círculo de números, status públicos e histórico de anúncios. */
export function TableTab({ players, announcements, viewerId }: { players: PlayerRow[]; announcements: AnnouncementRow[]; viewerId: string }) {
  const seated = players.filter((p) => p.seat !== null).sort((a, b) => a.seat! - b.seat!);
  const n = seated.length;
  const annByPlayer = new Map(announcements.filter((a) => a.player_id).map((a) => [a.player_id!, a]));
  const rounds = [...new Set(announcements.map((a) => a.round))].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-3">
      <section className="panel">
        <div className="relative mx-auto aspect-square w-full max-w-xs">
          {seated.map((p, i) => {
            const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + 42 * Math.cos(angle);
            const y = 50 + 42 * Math.sin(angle);
            const color =
              p.status === 'dead'
                ? 'bg-ink-800 text-zinc-600 line-through'
                : p.status === 'arrested'
                  ? 'bg-sky-900 text-sky-300'
                  : p.id === viewerId
                    ? 'bg-accent text-white'
                    : 'bg-ink-700 text-white';
            return (
              <div
                key={p.id}
                className={`absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold ${color}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {p.seat}
              </div>
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-zinc-500">
            {seated.filter((p) => p.status === 'alive').length} vivos
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 className="label mb-2">Jogadores</h3>
        <ul className="flex flex-col divide-y divide-ink-800">
          {seated.map((p) => {
            const ann = annByPlayer.get(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="w-8 text-right font-mono font-bold text-zinc-400">{p.seat}</span>
                <span className={`size-2 rounded-full ${p.is_bot || isOnline(p.last_seen_at) ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className={`flex-1 truncate ${p.status !== 'alive' ? 'text-zinc-500' : ''}`}>
                  {p.name}
                  {p.id === viewerId && <span className="text-zinc-500"> (você)</span>}
                </span>
                {ann && (
                  <span className={`text-right text-xs ${ann.kind === 'death' ? 'text-accent-soft' : 'text-sky-300'}`}>
                    {ann.kind === 'death' ? 'morto' : 'preso'} · {ann.character_name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h3 className="label mb-2">Anúncios</h3>
        {rounds.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum anúncio ainda.</p>
        ) : (
          rounds.map((r) => (
            <div key={r} className="mb-2">
              <p className="text-xs font-semibold text-zinc-500">Fim da rodada {r}</p>
              <ul className="text-sm">
                {announcements
                  .filter((a) => a.round === r)
                  .map((a) => (
                    <li key={a.idx}>{announcementText(a).title}</li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
