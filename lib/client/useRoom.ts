'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InvestigatorsTeamView, KillersTeamView } from '@/lib/engine';
import { ApiError, ROOM_CHANGED_EVENT, roomApi } from './api';
import { ensureSession, supabase } from './supabase';
import type {
  AnnouncementRow,
  CardRow,
  Identity,
  PlayerRow,
  PrivateData,
  PublicData,
  ResultRow,
  RevealRow,
  RoomRow,
  SecretRow,
  TeamStateRow,
} from './types';

export type Phase = 'loading' | 'ready' | 'not-member' | 'error';

const PUBLIC_TABLES = ['rooms', 'players', 'announcements', 'final_reveal'] as const;
const PRIVATE_TABLES = ['player_secrets', 'player_cards', 'player_results', 'team_state'] as const;
type Table = (typeof PUBLIC_TABLES)[number] | (typeof PRIVATE_TABLES)[number];

const EMPTY_PRIVATE: PrivateData = { secret: null, cards: [], results: [], killers: null, investigators: null };
const HEARTBEAT_MS = 15_000;
const SAFETY_REFRESH_MS = 30_000;

function splitTeams(rows: TeamStateRow[]): Pick<PrivateData, 'killers' | 'investigators'> {
  return {
    killers: (rows.find((r) => r.team === 'killers')?.data as KillersTeamView | undefined) ?? null,
    investigators: (rows.find((r) => r.team === 'investigators')?.data as InvestigatorsTeamView | undefined) ?? null,
  };
}

/**
 * Carrega e mantém em tempo real tudo que o jogador pode ver da sala.
 * Leituras passam pelo RLS; em modo dev, a visão de um bot vem da API.
 */
export function useRoom(code: string) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pub, setPub] = useState<PublicData>({ room: null, players: [], announcements: [], reveal: [] });
  const [priv, setPriv] = useState<PrivateData>(EMPTY_PRIVATE);
  const [viewAs, setViewAsState] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const report = useCallback((table: string, err: { message: string; code?: string }) => {
    console.error(`[alergia] falha ao ler ${table}:`, err);
    setLoadError(`${table}: ${err.message}${err.code ? ` (${err.code})` : ''}`);
  }, []);

  const idRef = useRef<Identity | null>(null);
  const viewAsRef = useRef<string | null>(null);
  const queued = useRef(new Set<Table>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTable = useCallback(
    async (t: Table) => {
      const id = idRef.current;
      if (!id) return;
      const sb = supabase();
      const devTarget = viewAsRef.current && viewAsRef.current !== id.playerId ? viewAsRef.current : null;
      switch (t) {
        case 'rooms': {
          const { data, error } = await sb.from('rooms').select('*').eq('id', id.roomId).maybeSingle();
          if (error) report('rooms', error);
          else if (!data) report('rooms', { message: 'a sala não foi retornada (bloqueada pelo RLS?)' });
          if (data) setPub((p) => ({ ...p, room: data as RoomRow }));
          return;
        }
        case 'players': {
          const { data, error } = await sb.from('players').select('*').eq('room_id', id.roomId).order('seat').order('joined_at');
          if (error) report('players', error);
          if (data) setPub((p) => ({ ...p, players: data as PlayerRow[] }));
          return;
        }
        case 'announcements': {
          const { data, error } = await sb.from('announcements').select('*').eq('room_id', id.roomId).order('round').order('seat');
          if (error) report('announcements', error);
          if (data) setPub((p) => ({ ...p, announcements: data as AnnouncementRow[] }));
          return;
        }
        case 'final_reveal': {
          const { data, error } = await sb.from('final_reveal').select('*').eq('room_id', id.roomId).order('seat');
          if (error) report('final_reveal', error);
          if (data) setPub((p) => ({ ...p, reveal: data as RevealRow[] }));
          return;
        }
      }
      // Dados privados
      if (devTarget) {
        const res = await roomApi(code, 'dev-view', { playerId: devTarget }).catch(() => null);
        if (!res || viewAsRef.current !== devTarget) return;
        const r = res as unknown as { secret: SecretRow | null; cards: CardRow[]; results: ResultRow[]; teams: TeamStateRow[] };
        setPriv({ secret: r.secret, cards: r.cards, results: r.results, ...splitTeams(r.teams) });
        return;
      }
      switch (t) {
        case 'player_secrets': {
          const { data, error } = await sb.from('player_secrets').select('*').eq('player_id', id.playerId).maybeSingle();
          if (error) report('player_secrets', error);
          setPriv((p) => ({ ...p, secret: (data as SecretRow | null) ?? null }));
          return;
        }
        case 'player_cards': {
          const { data, error } = await sb.from('player_cards').select('*').eq('player_id', id.playerId).order('slot');
          if (error) report('player_cards', error);
          if (data) setPriv((p) => ({ ...p, cards: data as CardRow[] }));
          return;
        }
        case 'player_results': {
          const { data, error } = await sb.from('player_results').select('*').eq('player_id', id.playerId).order('idx');
          if (error) report('player_results', error);
          if (data) setPriv((p) => ({ ...p, results: data as ResultRow[] }));
          return;
        }
        case 'team_state': {
          const { data, error } = await sb.from('team_state').select('team, data').eq('room_id', id.roomId);
          if (error) report('team_state', error);
          if (data) setPriv((p) => ({ ...p, ...splitTeams(data as TeamStateRow[]) }));
          return;
        }
      }
    },
    [code, report],
  );

  const refresh = useCallback(
    (tables: readonly Table[]) => {
      for (const t of tables) queued.current.add(t);
      if (timer.current) return;
      timer.current = setTimeout(async () => {
        timer.current = null;
        const batch = [...queued.current];
        queued.current.clear();
        // Em modo dev, uma única chamada cobre todas as tabelas privadas.
        const devTarget = viewAsRef.current && viewAsRef.current !== idRef.current?.playerId;
        const list = devTarget
          ? [...batch.filter((t) => (PUBLIC_TABLES as readonly string[]).includes(t)), ...(batch.some((t) => (PRIVATE_TABLES as readonly string[]).includes(t)) ? (['player_secrets'] as Table[]) : [])]
          : batch;
        await Promise.all(list.map((t) => fetchTable(t).catch(() => {})));
      }, 120);
    },
    [fetchTable],
  );

  const refreshAll = useCallback(() => refresh([...PUBLIC_TABLES, ...PRIVATE_TABLES]), [refresh]);

  const sendHeartbeat = useCallback(async () => {
    const res = (await roomApi(code, 'heartbeat')) as unknown as Identity & { actingHostId: string };
    const id: Identity = {
      playerId: res.playerId,
      roomId: res.roomId,
      isOriginalHost: res.isOriginalHost,
      devTools: res.devTools,
    };
    const prev = idRef.current;
    idRef.current = id;
    if (!prev || prev.playerId !== id.playerId || prev.devTools !== id.devTools) setIdentity(id);
    return id;
  }, [code]);

  // Inicialização, Realtime, heartbeat
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
    let hb: ReturnType<typeof setInterval> | null = null;
    let safety: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const session = await ensureSession();
        const id = await sendHeartbeat();
        if (cancelled) return;
        const sb = supabase();
        // Não deixa o Realtime travar a carga da sala.
        await Promise.race([
          Promise.resolve(sb.realtime.setAuth(session.access_token)).catch(() => {}),
          new Promise((r) => setTimeout(r, 3000)),
        ]);
        channel = sb.channel(`room-${id.roomId}-${Math.random().toString(36).slice(2)}`);
        for (const t of [...PUBLIC_TABLES, ...PRIVATE_TABLES]) {
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: t, filter: t === 'rooms' ? `id=eq.${id.roomId}` : `room_id=eq.${id.roomId}` },
            () => refresh([t]),
          );
        }
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') refreshAll();
        });
        refreshAll();
        setPhase('ready');
        hb = setInterval(() => sendHeartbeat().catch(() => {}), HEARTBEAT_MS);
        safety = setInterval(refreshAll, SAFETY_REFRESH_MS);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setPhase('not-member');
        } else {
          setError(e instanceof Error ? e.message : 'Erro ao carregar a sala.');
          setPhase('error');
        }
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && idRef.current) {
        sendHeartbeat().catch(() => {});
        refreshAll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const onChanged = () => idRef.current && refreshAll();
    window.addEventListener(ROOM_CHANGED_EVENT, onChanged);
    const { data: authSub } = supabase().auth.onAuthStateChange((_evt, session) => {
      if (session) supabase().realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ROOM_CHANGED_EVENT, onChanged);
      authSub.subscription.unsubscribe();
      if (hb) clearInterval(hb);
      if (safety) clearInterval(safety);
      if (channel) supabase().removeChannel(channel);
    };
  }, [code, refresh, refreshAll, sendHeartbeat]);

  // Em modo dev, a visão de um bot é consultada periodicamente.
  useEffect(() => {
    if (!viewAs || viewAs === identity?.playerId) return;
    const t = setInterval(() => refresh(['player_secrets']), 2500);
    return () => clearInterval(t);
  }, [viewAs, identity?.playerId, refresh]);

  const setViewAs = useCallback(
    (playerId: string | null) => {
      viewAsRef.current = playerId;
      setViewAsState(playerId);
      setPriv(EMPTY_PRIVATE);
      refresh([...PRIVATE_TABLES]);
    },
    [refresh],
  );

  return { phase, error, loadError, identity, pub, priv, viewAs, setViewAs, refreshAll, sendHeartbeat };
}
