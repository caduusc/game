'use client';

import { useEffect, useState } from 'react';
import { roomApi } from '@/lib/client/api';
import { serverNow } from '@/lib/client/clock';
import type { SecretData } from '@/lib/engine';

type Sabotage = NonNullable<SecretData['sabotage']>;

/** Aviso e pergunta de 10 segundos para quem está sendo sabotado. */
export function SabotageModal({ code, sabotage, actAs }: { code: string; sabotage: Sabotage; actAs: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (sabotage.status !== 'open') return;
    const t = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(t);
  }, [sabotage.status]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await roomApi(code, 'sabotage', { ...body, actAs });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setBusy(false);
    }
  }

  const left = sabotage.deadline ? Math.max(0, sabotage.deadline - now) : sabotage.seconds * 1000;
  const secs = Math.ceil(left / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="panel w-full max-w-md border-accent/60">
        <p className="label text-accent-soft">Sabotagem</p>
        {sabotage.status === 'pending' ? (
          <>
            <p className="mt-2 text-xl font-bold">Você está sendo sabotado!</p>
            <p className="mt-2 text-sm text-zinc-300">
              Ao abrir, você terá só <b>{sabotage.seconds} segundos</b> para responder uma pergunta de múltipla escolha. Se errar ou o tempo
              acabar, você recebe o alvo dos assassinos. A rodada só vira depois da sua resposta.
            </p>
            <button className="btn-primary mt-4 w-full" disabled={busy} onClick={() => send({ action: 'open' })}>
              Abrir pergunta
            </button>
          </>
        ) : (
          <>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-sm text-zinc-400">Responda rápido</p>
              <p className={`font-mono text-3xl font-black ${secs <= 3 ? 'text-accent' : 'text-white'}`}>{secs}s</p>
            </div>
            <p className="mt-2 text-lg font-bold">{sabotage.question}</p>
            <div className="mt-3 grid gap-2">
              {(sabotage.options ?? []).map((o, i) => (
                <button
                  key={i}
                  className="btn-ghost justify-start text-left"
                  disabled={busy}
                  onClick={() => send({ action: 'answer', option: i })}
                >
                  {String.fromCharCode(65 + i)}) {o}
                </button>
              ))}
            </div>
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
