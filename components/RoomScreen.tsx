'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
