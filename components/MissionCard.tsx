'use client';

import { useState } from 'react';
import { roomApi } from '@/lib/client/api';
import type { CardRow } from '@/lib/client/types';

/** Card uniforme: mesma aparência para ações reais e tarefas decorativas. */
export function MissionCard({ code, card, locked, actAs }: { code: string; card: CardRow; locked: boolean; actAs: string | null }) {
  const [choice, setChoice] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsChoice = card.fields !== 'text';
  const needsText = card.fields !== 'choice';
  const options = card.options ?? [];
  const asButtons = card.fields === 'choice' && options.length <= 4;
  const open = card.status === 'open' && !locked;
  // O primeiro parágrafo é a explicação de para que serve a ação.
  const split = card.prompt.indexOf('\n\n');
  const help = split > 0 ? card.prompt.slice(0, split) : null;
  const body = split > 0 ? card.prompt.slice(split + 2) : card.prompt;

  async function send(payload: { choice?: string | null; text?: string | null; skip?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await roomApi(code, 'action', { slot: card.slot, actAs, ...payload });
      setChoice('');
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar.');
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsChoice && !choice) {
      setError('Escolha uma opção.');
      return;
    }
    send({ choice: needsChoice ? choice : null, text: needsText ? text : null });
  }

  return (
    <article className={`panel ${card.status === 'done' ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="label">{card.title}</h3>
        {card.status === 'done' && <span className="text-xs font-semibold text-emerald-400">Concluída</span>}
      </div>
      {help && <p className="mt-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm leading-snug text-zinc-400">{help}</p>}
      <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-zinc-100">{body}</p>

      {card.status === 'open' && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          {needsChoice && asButtons && (
            <div className="grid grid-cols-1 gap-2">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={!open || busy}
                  onClick={() => setChoice(o.value)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                    choice === o.value ? 'border-accent bg-accent/15 text-white' : 'border-ink-600 bg-ink-950 text-zinc-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {needsChoice && !asButtons && (
            <select
              className="input"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={!open || busy}
              aria-label="Escolha"
            >
              <option value="">Escolha…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
          <button className="btn-primary" disabled={!open || busy}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
          {card.skip_label && (
            <button type="button" className="btn-ghost" disabled={!open || busy} onClick={() => send({ skip: true })}>
              {card.skip_label}
            </button>
          )}
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {card.feedback && !error && <p className="mt-2 rounded-lg bg-ink-800 px-3 py-2 text-sm text-zinc-200">{card.feedback}</p>}
    </article>
  );
}
