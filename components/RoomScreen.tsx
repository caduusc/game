'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRoom } from '@/lib/client/useRoom';
import { DevBar } from './DevBar';
import { EndScreen } from './EndScreen';
import { Game } from './Game';
import { Lobby } from './Lobby';

export function RoomScreen({ code }: { code: string }) {
  const router = useRouter();
  const r = useRoom(code);
  const { phase, identity, pub } = r;

  useEffect(() => {
    if (phase === 'not-member') router.replace(`/?code=${code}`);
  }, [phase, code, router]);

  // Se a sala não carregar em alguns segundos, mostra o motivo em vez de girar para sempre.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (phase === 'error') {
    return (
      <Centered>
        <p className="text-red-300">{r.error}</p>
        <button className="btn-ghost mt-4" onClick={() => location.reload()}>
          Tentar de novo
        </button>
      </Centered>
    );
  }
  if (phase !== 'ready' || !identity || !pub.room) {
    return (
      <Centered>
        <div className="size-10 animate-spin rounded-full border-4 border-ink-600 border-t-accent" />
        <p className="mt-4 text-sm text-zinc-400">Conectando à sala {code}…</p>
        {slow && (
          <div className="mt-6 max-w-sm rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-100">
            <p className="font-semibold">Não foi possível carregar a sala.</p>
            <p className="mt-1 break-words text-red-200/80">
              {r.loadError ?? (phase === 'loading' ? 'O servidor ainda não respondeu.' : 'Sem resposta do Supabase.')}
            </p>
            <button className="btn-ghost mt-3 w-full py-2" onClick={() => location.reload()}>
              Tentar de novo
            </button>
          </div>
        )}
      </Centered>
    );
  }

  const room = pub.room;
  const viewerId = r.viewAs ?? identity.playerId;
  const isHost = room.acting_host_player_id === identity.playerId;
  const showDev = identity.devTools && identity.isOriginalHost;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {showDev && <DevBar code={code} room={room} players={pub.players} myId={identity.playerId} viewAs={viewerId} setViewAs={r.setViewAs} />}
      {room.status === 'lobby' && <Lobby code={code} room={room} players={pub.players} myId={identity.playerId} isHost={isHost} />}
      {room.status === 'playing' && (
        <Game
          code={code}
          room={room}
          pub={pub}
          priv={r.priv}
          myId={identity.playerId}
          viewerId={viewerId}
          isHost={isHost}
          isOriginalHost={identity.isOriginalHost}
        />
      )}
      {room.status === 'finished' && <EndScreen room={room} pub={pub} priv={r.priv} viewerId={viewerId} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</main>;
}
