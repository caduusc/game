'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, roomApi } from '@/lib/client/api';
import { Logo } from './Logo';

type Mode = 'join' | 'create' | 'rejoin';

const NAME_KEY = 'alergia-name';
const IS_DEV = process.env.NODE_ENV === 'development';

export function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>('join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [rejoinCode, setRejoinCode] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [devMode, setDevMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? '');
    } catch {}
    const c = params.get('code');
    if (c) setCode(c.toUpperCase().slice(0, 4));
  }, [params]);

  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {}
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        remember();
        const res = await api<{ code: string }>('/api/rooms', { name, roundMinutes: minutes, devMode });
        router.push(`/sala/${res.code}`);
      } else if (mode === 'join') {
        remember();
        const c = code.trim().toUpperCase();
        await roomApi(c, 'join', { name });
        router.push(`/sala/${c}`);
      } else {
        const c = code.trim().toUpperCase();
        await roomApi(c, 'rejoin', { rejoinCode });
        router.push(`/sala/${c}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.');
      setBusy(false);
    }
  }

  const tabs: [Mode, string][] = [
    ['join', 'Entrar'],
    ['create', 'Criar sala'],
    ['rejoin', 'Reentrada'],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <Logo />
      <p className="mt-3 text-center text-sm text-zinc-400">
        Dedução social presencial. Todos na mesma sala, cada um com seu celular.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-1 rounded-xl bg-ink-900 p-1">
        {tabs.map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold ${mode === m ? 'bg-ink-700 text-white' : 'text-zinc-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="panel mt-4 flex flex-col gap-3">
        {mode !== 'create' && (
          <label className="flex flex-col gap-1">
            <span className="label">Código da sala</span>
            <input
              className="input text-center text-2xl font-bold tracking-[0.4em] uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              required
              minLength={4}
            />
          </label>
        )}

        {mode !== 'rejoin' && (
          <label className="flex flex-col gap-1">
            <span className="label">Seu nome</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              placeholder="Como te chamam na mesa"
              autoComplete="nickname"
              required
            />
          </label>
        )}

        {mode === 'create' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="label">Minutos por rodada</span>
              <select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15].map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'minuto' : 'minutos'}
                  </option>
                ))}
              </select>
            </label>
            {IS_DEV && (
              <label className="flex items-center gap-3 rounded-xl border border-dashed border-amber-500/40 p-3 text-sm text-amber-200">
                <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} className="size-5" />
                Modo de teste (bots e troca de visão)
              </label>
            )}
          </>
        )}

        {mode === 'rejoin' && (
          <label className="flex flex-col gap-1">
            <span className="label">Código de reentrada</span>
            <input
              className="input text-center text-xl font-bold tracking-[0.3em] uppercase"
              value={rejoinCode}
              onChange={(e) => setRejoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
              placeholder="XXXXXX"
              autoCapitalize="characters"
              autoComplete="off"
              required
            />
            <span className="text-xs text-zinc-500">Peça ao host. O código vale por 10 minutos e só funciona uma vez.</span>
          </label>
        )}

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button className="btn-primary mt-1" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'create' ? 'Criar sala' : mode === 'join' ? 'Entrar na sala' : 'Voltar ao meu lugar'}
        </button>
      </form>

      <p className="mt-auto pt-10 text-center text-xs text-zinc-600">
        De 10 a 20 jogadores. Se fechar o navegador, é só abrir de novo: você volta ao mesmo lugar.
      </p>
    </main>
  );
}
