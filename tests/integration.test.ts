/**
 * Teste de integração dos Route Handlers contra um Postgres real.
 * Só roda com TEST_DATABASE_URL apontando para um banco com
 * tests/sql/supabase-stub.sql + supabase/migrations + supabase/seed.sql aplicados.
 *
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/alergia_test npm test
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setDb } from '@/lib/server/db';
import { loadState, saveState } from '@/lib/server/persist';
import * as H from '@/lib/server/handlers';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('integração com Postgres', () => {
  let sql: postgres.Sql;
  const host = randomUUID();
  const others = Array.from({ length: 11 }, () => randomUUID());
  let code = '';
  let roomId = '';

  /** Executa uma consulta como um usuário autenticado (RLS ativo). */
  async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out: T;
    await sql
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        await tx`set local role authenticated`;
        out = await fn(tx);
        throw new Error('rollback');
      })
      .catch((e) => {
        if (e.message !== 'rollback') throw e;
      });
    return out!;
  }

  async function pastEnd() {
    await sql`update public.rooms set ends_at = now() - interval '5 seconds' where id = ${roomId}`;
  }

  beforeAll(() => {
    sql = postgres(url!, { prepare: false, max: 4, onnotice: () => {} });
    setDb(sql);
  });

  afterAll(async () => {
    setDb(undefined);
    await sql.end();
  });

  it('cria sala, entra, inicia', async () => {
    const created = await H.createRoom(host, { name: 'Host', roundMinutes: 5 });
    code = created.code as string;
    roomId = created.roomId as string;
    expect(code).toMatch(/^[A-Z]{4}$/);
    for (const [i, u] of others.slice(0, 8).entries()) await H.joinRoom(u, code, { name: `P${i}` });
    await expect(H.startGame(host, code)).rejects.toThrow(/10 a 20/);
    await expect(H.joinRoom(others[8], code, { name: 'p0' })).rejects.toThrow(/nome/);
    await H.joinRoom(others[8], code, { name: 'P8' });
    await expect(H.startGame(others[0], code)).rejects.toThrow(/host/);
    await H.startGame(host, code);
    await expect(H.joinRoom(others[9], code, { name: 'Tarde' })).rejects.toThrow(/começou/);
    const [room] = await sql`select * from public.rooms where id = ${roomId}`;
    expect(room.status).toBe('playing');
    expect(room.current_round).toBe(1);
  });

  it('RLS: cada um só lê os próprios segredos e a própria equipe', async () => {
    const all = [host, ...others.slice(0, 9)];
    const killers = await sql<{ user_id: string }[]>`
      select p.user_id from public.team_members tm join public.players p on p.id = tm.player_id
      where tm.room_id = ${roomId} and tm.team = 'killers'`;
    for (const u of all) {
      const res = await asUser(u, async (tx) => ({
        players: await tx`select * from public.players where room_id = ${roomId}`,
        secrets: await tx`select * from public.player_secrets where room_id = ${roomId}`,
        cards: await tx`select * from public.player_cards where room_id = ${roomId}`,
        teams: await tx`select team from public.team_state where room_id = ${roomId}`,
      }));
      expect(res.players).toHaveLength(10);
      expect(res.secrets).toHaveLength(1);
      const [mine] = await sql`select id from public.players where user_id = ${u} and room_id = ${roomId}`;
      expect(res.cards.every((c) => c.player_id === mine.id)).toBe(true);
      const isKiller = killers.some((k) => k.user_id === u);
      expect(res.teams.some((t) => t.team === 'killers')).toBe(isKiller);
    }
    // Quem não está na sala não vê nada.
    const stranger = await asUser(randomUUID(), (tx) => tx`select * from public.rooms where id = ${roomId}`);
    expect(stranger).toHaveLength(0);
    // Tabelas ocultas: sem acesso.
    await expect(asUser(host, (tx) => tx`select * from game_private.characters`)).rejects.toThrow(/permission denied/);
    // Sem escrita.
    await expect(asUser(host, (tx) => tx`update public.players set status = 'dead' where room_id = ${roomId}`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('ações travam ao fim do tempo e o tick é idempotente', async () => {
    const r1 = await H.tick(host, code);
    expect(r1.resolved).toBe(false);
    await pastEnd();
    await expect(H.submitAction(host, code, { slot: 1, text: 'x', choice: '1' })).rejects.toThrow(/tempo/);
    const results = await Promise.all([H.tick(host, code), H.tick(others[0], code), H.tick(others[1], code)]);
    expect(results.filter((r) => r.resolved)).toHaveLength(1);
    const [room] = await sql`select * from public.rooms where id = ${roomId}`;
    expect(room.current_round).toBe(2);
    expect(room.resolved_round).toBe(1);
    const ann = await sql`select * from public.announcements where room_id = ${roomId}`;
    expect(ann).toHaveLength(1);
    expect(Object.keys(ann[0])).not.toContain('role');
  });

  it('pausa e retoma', async () => {
    await H.pauseGame(host, code);
    await expect(H.submitAction(host, code, { slot: 1, text: 'x', choice: '1' })).rejects.toThrow(/pausada/);
    await pastEnd().catch(() => {});
    await sql`update public.rooms set ends_at = null where id = ${roomId}`;
    expect((await H.tick(host, code)).resolved).toBe(false);
    await H.resumeGame(host, code);
    const [room] = await sql`select * from public.rooms where id = ${roomId}`;
    expect(room.ends_at).not.toBeNull();
  });

  it('reentrada com código de uso único', async () => {
    const [target] = await sql<{ id: string; user_id: string }[]>`
      select id, user_id from public.players where room_id = ${roomId} and user_id = ${others[2]}`;
    await expect(H.createRejoinCode(others[0], code, { playerId: target.id })).rejects.toThrow(/host/);
    const { rejoinCode } = await H.createRejoinCode(host, code, { playerId: target.id });
    const newUser = randomUUID();
    await expect(H.rejoinRoom(newUser, code, { rejoinCode: 'ZZZZZZ' })).rejects.toThrow(/inválido/);
    await H.rejoinRoom(newUser, code, { rejoinCode });
    await expect(H.rejoinRoom(randomUUID(), code, { rejoinCode })).rejects.toThrow(/inválido/);
    const oldView = await asUser(others[2], (tx) => tx`select * from public.player_secrets where room_id = ${roomId}`);
    const newView = await asUser(newUser, (tx) => tx`select * from public.player_secrets where room_id = ${roomId}`);
    expect(oldView).toHaveLength(0);
    expect(newView).toHaveLength(1);
    others[2] = newUser;
  });

  it('host desconectado por mais de 60 s: controles passam e voltam', async () => {
    await sql`update public.players set last_seen_at = now() - interval '2 minutes' where room_id = ${roomId}`;
    const alive = await sql<{ id: string; user_id: string; seat: number }[]>`
      select id, user_id, seat from public.players
      where room_id = ${roomId} and status = 'alive' and user_id <> ${host} order by seat`;
    // Dois jogadores voltam a mandar heartbeat; o de menor número vira host.
    const [a, b] = [alive[1], alive[0]];
    await H.heartbeat(a.user_id, code);
    const hb = await H.heartbeat(b.user_id, code);
    expect(hb.actingHostId).toBe(b.id);
    await H.pauseGame(b.user_id, code);
    await H.resumeGame(b.user_id, code);
    await expect(H.pauseGame(a.user_id, code)).rejects.toThrow(/host/);
    // Host original volta.
    const back = await H.heartbeat(host, code);
    const [hostRow] = await sql`select id from public.players where user_id = ${host}`;
    expect(back.actingHostId).toBe(hostRow.id);
    await expect(H.pauseGame(b.user_id, code)).rejects.toThrow(/host/);
  });

  it('partida completa até o fim com ações de todos', async () => {
    const users = [host, ...others.slice(0, 9)];
    let sawStandby = false;
    for (let guard = 0; guard < 40; guard++) {
      const [room] = await sql`select * from public.rooms where id = ${roomId}`;
      if (room.status === 'finished') break;
      for (const u of users) {
        for (let pass = 0; pass < 4; pass++) {
          const cards = await asUser(u, (tx) => tx`select * from public.player_cards where room_id = ${roomId} order by slot`);
          for (const c of cards) {
            if (c.status !== 'open' || c.round !== room.current_round) continue;
            let choice: string | null = c.options?.[0]?.value ?? null;
            const weaponFor = /O que mata o número (\d+)\?/.exec(c.prompt);
            if (weaponFor) {
              // Assassino "trapaceia" consultando o estado oculto, para a partida terminar.
              const [{ state }] = await sql`select state from game_private.game_state where room_id = ${roomId}`;
              const victim = state.players.find((p: { seat: number }) => p.seat === Number(weaponFor[1]));
              choice = state.characters.find((ch: { id: string }) => ch.id === victim.characterId).weapon;
            }
            await H.submitAction(u, code, { slot: c.slot, choice, text: 'resposta' }).catch((e) => {
              if (!/inválid|Não há|fora do jogo|concluída|primeiro|opções|alvos|Sabotagem/.test(e.message)) throw e;
            });
          }
        }
      }
      await pastEnd();
      await H.tick(host, code);
      // Sabotagem pendente segura a virada: o sabotado responde e a rodada vira.
      for (let i = 0; i < 3; i++) {
        const [r] = await sql`select standby from public.rooms where id = ${roomId}`;
        if (!r.standby) break;
        sawStandby = true;
        const [{ state }] = await sql`select state from game_private.game_state where room_id = ${roomId}`;
        const pending = state.sabotages.find((x: { status: string }) => x.status === 'pending' || x.status === 'open');
        const [target] = await sql`select user_id from public.players where id = ${pending.targetId}`;
        await H.sabotageAction(target.user_id, code, { action: 'open' });
        await H.sabotageAction(target.user_id, code, { action: 'answer', option: 0 });
      }
    }
    const [room] = await sql`select * from public.rooms where id = ${roomId}`;
    expect(room.status).toBe('finished');
    expect(['killers', 'good']).toContain(room.winner);
    const reveal = await asUser(host, (tx) => tx`select * from public.final_reveal where room_id = ${roomId}`);
    expect(reveal).toHaveLength(10);
    const actions = await sql`select count(*)::int as n from game_private.actions where room_id = ${roomId}`;
    expect(actions[0].n).toBeGreaterThan(0);
    const anns = await asUser(host, (tx) => tx`select kind from public.announcements where room_id = ${roomId}`);
    expect(anns.some((a) => a.kind === 'targeted')).toBe(true);
    void sawStandby;
  }, 120_000);

  it('modo dev: bots e visualização', async () => {
    const devHost = randomUUID();
    const created = await H.createRoom(devHost, { name: 'Dev', devMode: true });
    const c = created.code as string;
    await H.devAddBots(devHost, c, { count: 9 });
    await expect(H.devAddBots(randomUUID(), c, { count: 1 })).rejects.toThrow(/sala/);
    await H.startGame(devHost, c);
    const bots = await sql<{ id: string }[]>`
      select id from public.players where room_id = ${created.roomId as string} and is_bot order by seat`;
    const view = await H.devView(devHost, c, { playerId: bots[0].id });
    expect(view.secret).toBeTruthy();
    expect((view.cards as { player_id: string }[]).every((c) => c.player_id === bots[0].id)).toBe(true);
    await H.submitAction(devHost, c, { slot: 3, choice: '1', text: 'teste', actAs: bots[0].id }).catch((e) => {
      if (!/inválid|Não há|concluída|opções|Digite|Missão não encontrada/.test(e.message)) throw e;
    });
    const roles = (await H.devRoles(devHost, c)).roles as Record<string, { role: string }>;
    expect(Object.keys(roles)).toHaveLength(10);
    expect(Object.values(roles).filter((r) => r.role.startsWith('Assassino'))).toHaveLength(2);
    await expect(H.devRoles(randomUUID(), c)).rejects.toThrow(/sala/);
    const forced = await H.devForceEnd(devHost, c);
    expect(forced.resolved).toBe(true);
  });
  it('sabotagem: a virada espera a resposta e o alvo muda de pessoa', async () => {
    const devHost = randomUUID();
    const created = await H.createRoom(devHost, { name: 'Dev2', devMode: true });
    const c = created.code as string;
    const rid = created.roomId as string;
    await H.devAddBots(devHost, c, { count: 9 });
    await H.startGame(devHost, c);
    // Vira para a rodada 2 e coloca um ataque em andamento num cidadão.
    await H.devForceEnd(devHost, c);
    let citizen: { id: string; seat: number } | undefined;
    let victim: { id: string; seat: number } | undefined;
    await sql.begin(async (tx) => {
      const state = await loadState(tx, rid);
      const citizens = state.players.filter((p) => p.role === 'citizen' && p.status === 'alive');
      const cards = (id: string) => state.cards[id] ?? [];
      citizen = citizens.find((p) => cards(p.id).some((x) => x.kind === 'citizen_check' && x.quiz));
      victim = state.players.find((p) => p.status === 'alive' && p.id !== citizen!.id && p.role !== 'killer');
      state.attacks.push({
        id: 999, killerId: null, seat: citizen!.seat, side: null, weapon: null,
        chosenRound: state.round - 1, resolvesAfterRound: state.round, sabotagedFrom: null,
      });
      await saveState(tx, rid, state);
    });
    const [{ state }] = await sql`select state from game_private.game_state where room_id = ${rid}`;
    const card = state.cards[citizen!.id].find((x: { kind: string }) => x.kind === 'citizen_check');
    const act = (body: Record<string, unknown>) => H.submitAction(devHost, c, { slot: card.slot, actAs: citizen!.id, ...body });
    expect((await act({ text: card.riddle.answers[0] })).feedback).toMatch(/ESTÁ entre/);
    await act({ choice: 'yes' });
    await act({ choice: String(victim!.seat) });
    await act({ choice: String(card.quiz[0].id) });
    // Tempo acaba: a virada fica parada.
    await sql`update public.rooms set ends_at = now() - interval '5 seconds' where id = ${rid}`;
    expect((await H.tick(devHost, c)).resolved).toBe(false);
    const [r1] = await sql`select standby, current_round from public.rooms where id = ${rid}`;
    expect(r1.standby).toBe(true);
    // Sabotado abre e erra: a rodada vira sozinha.
    await H.sabotageAction(devHost, c, { action: 'open', actAs: victim!.id });
    const wrong = (card.quiz[0].answer + 1) % 4;
    expect((await H.sabotageAction(devHost, c, { action: 'answer', option: wrong, actAs: victim!.id })).correct).toBe(false);
    const [r2] = await sql`select standby, current_round from public.rooms where id = ${rid}`;
    expect(r2.standby).toBe(false);
    expect(r2.current_round).toBe(r1.current_round + 1);
    const statuses = await sql`select id, status from public.players where id in ${sql([citizen!.id, victim!.id])}`;
    expect(statuses.find((p) => p.id === victim!.id)!.status).toBe('dead');
    expect(statuses.find((p) => p.id === citizen!.id)!.status).toBe('alive');
    const anns = await sql`select kind, seat from public.announcements where room_id = ${rid} and kind like 'sabotage%'`;
    expect(anns).toEqual([{ kind: 'sabotage_ok', seat: citizen!.seat }]);
  });
});
