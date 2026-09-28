'use client';

import { announcementText } from '@/lib/client/announcements';
import type { AnnouncementRow } from '@/lib/client/types';

const TONE = { death: 'text-accent-soft', arrest: 'text-sky-300', info: 'text-amber-300' } as const;
const LABEL = { death: 'Morte', arrest: 'Prisão', info: 'Aviso' } as const;

export function TurnModal({ round, items, onClose }: { round: number; items: AnnouncementRow[]; onClose: () => void }) {
  const deaths = items.filter((a) => a.kind === 'death' || a.kind === 'arrest');
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="label">Fim da rodada {round}</p>
        {deaths.length === 0 && <p className="mt-3 text-lg font-semibold">Ninguém saiu do jogo nesta rodada.</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((a) => {
            const t = announcementText(a);
            return (
              <li key={a.idx} className="rounded-xl bg-ink-800 p-3">
                <p className={`text-xs font-bold uppercase ${TONE[t.tone]}`}>{LABEL[t.tone]}</p>
                <p className="mt-1 font-bold">{t.title}</p>
                {t.detail && <p className="text-sm text-zinc-300">{t.detail}</p>}
              </li>
            );
          })}
        </ul>
        <button className="btn-primary mt-4 w-full" onClick={onClose}>
          Continuar
        </button>
      </div>
    </div>
  );
}
