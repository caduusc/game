'use client';

import { recordServerTime } from './clock';
import { ensureSession } from './supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, body: unknown = {}): Promise<T> {
  const session = await ensureSession();
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Sem conexão. Tente de novo.');
  }
  const receivedAt = Date.now();
  const json = (await res.json().catch(() => ({}))) as { error?: string; serverNow?: number } & T;
  if (typeof json.serverNow === 'number') recordServerTime(json.serverNow, sentAt, receivedAt);
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Erro inesperado.');
  return json;
}

const READ_ONLY_OPS = new Set(['heartbeat', 'dev-view']);

/** Chama uma operação da sala. Depois de escritas, avisa a tela para recarregar (além do Realtime). */
export async function roomApi(code: string, op: string, body: unknown = {}) {
  const res = await api(`/api/rooms/${code}/${op}`, body);
  if (!READ_ONLY_OPS.has(op) && typeof window !== 'undefined') window.dispatchEvent(new Event(ROOM_CHANGED_EVENT));
  return res;
}

export const ROOM_CHANGED_EVENT = 'alergia:changed';
