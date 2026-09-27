'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'alergia-auth' },
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return client;
}

let pending: Promise<Session> | null = null;

/** Garante uma sessão anônima persistida no navegador (reconexão automática). */
export function ensureSession(): Promise<Session> {
  if (!pending) {
    pending = (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session;
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error || !signed.session) throw new Error(error?.message ?? 'Falha no login anônimo.');
      return signed.session;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
