import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors';

/** Valida o JWT (sessão anônima do Supabase) enviado no header Authorization. */
export async function getUserId(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sessão ausente.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Variáveis do Supabase não configuradas.');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida. Recarregue a página.');
  return data.user.id;
}
