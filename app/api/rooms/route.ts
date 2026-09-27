import { getUserId } from '@/lib/server/auth';
import { createRoom } from '@/lib/server/handlers';
import { readJson, respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/** Cria uma sala; quem cria é o host. */
export async function POST(req: Request) {
  return respond(async () => createRoom(await getUserId(req), await readJson(req)));
}
