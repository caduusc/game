import { NextResponse } from 'next/server';
import { GameError } from '@/lib/engine';
import { HttpError } from './errors';

export async function respond(fn: () => Promise<Record<string, unknown>>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, serverNow: Date.now() }, { status: e.status });
    if (e instanceof GameError) return NextResponse.json({ error: e.message, serverNow: Date.now() }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Erro interno. Tente de novo.', serverNow: Date.now() }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}
