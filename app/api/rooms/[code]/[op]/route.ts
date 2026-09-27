import { getUserId } from '@/lib/server/auth';
import { HttpError } from '@/lib/server/errors';
import { ROOM_OPS } from '@/lib/server/handlers';
import { readJson, respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/[code]/[op]
 * ops: join, rejoin, heartbeat, start, pause, resume, end, tick, action,
 *      rejoin-code, dev-bots, dev-view, dev-force-end
 */
export async function POST(req: Request, { params }: { params: Promise<{ code: string; op: string }> }) {
  return respond(async () => {
    const { code, op } = await params;
    const handler = ROOM_OPS[op];
    if (!handler) throw new HttpError(404, 'Operação desconhecida.');
    return handler(await getUserId(req), code, await readJson(req));
  });
}
