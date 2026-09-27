'use client';

import { useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { CardRow } from '@/lib/client/types';

/** Card uniforme: mesma aparência para ações reais e tarefas decorativas. */
export function MissionCard({ code, card, locked, actAs }: { code: string; card: CardRow; locked: boolean; actAs: string | null }) {
  const [number, setNumber] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsNumber = card.fields !== 'text';
  const needsText = card.fields !== 'number';
  const open = card.status === 'open' && !locked;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await roomApi(code, 'action', {
        slot: card.slot,
        number: needsNumber ? number : null,
        text: needsText ? text : null,
        actAs,
      });
      setNumber('');
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`panel ${card.status === 'done' ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="label">{card.title}</h3>
        {card.status === 'done' && <span className="text-xs font-semibold text-emerald-400">Concluída</span>}
      </div>
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-zinc-100">{card.prompt}</p>

      {card.status === 'open' && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            {needsNumber && (
              <input
                className={`input ${needsText ? 'w-24 shrink-0' : ''} text-center`}
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="Nº"
                aria-label="Número do jogador"
                disabled={!open || busy}
                required
              />
            )}
            {needsText && (
              <input
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 200))}
                placeholder="Sua resposta"
                aria-label="Resposta"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={!open || busy}
                required
              />
            )}
          </div>
          <button className="btn-primary" disabled={!open || busy}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {card.feedback && !error && <p className="mt-2 rounded-lg bg-ink-800 px-3 py-2 text-sm text-zinc-200">{card.feedback}</p>}
    </article>
  );
}
