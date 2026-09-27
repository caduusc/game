'use client';

import type { AnnouncementRow } from '@/lib/client/types';

export function TurnModal({ round, items, onClose }: { round: number; items: AnnouncementRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="label">Fim da rodada {round}</p>
        {items.length === 0 ? (
          <p className="mt-3 text-lg font-semibold">Ninguém saiu do jogo nesta rodada.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((a) => (
              <li key={a.player_id} className="rounded-xl bg-ink-800 p-3">
                <p className={`text-xs font-bold uppercase ${a.kind === 'death' ? 'text-accent-soft' : 'text-sky-300'}`}>
                  {a.kind === 'death' ? 'Morreu' : 'Foi preso'}
                </p>
                <p className="mt-1 text-lg font-bold">
                  nº {a.seat} · {a.name}
                </p>
                <p className="text-sm text-zinc-300">era {a.character_name}</p>
              </li>
            ))}
          </ul>
        )}
        <button className="btn-primary mt-4 w-full" onClick={onClose}>
          Continuar
        </button>
      </div>
    </div>
  );
}
