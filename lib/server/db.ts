import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __alergiaSql: postgres.Sql | undefined;
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]|host=\/|@\/|[?&]sslmode=disable/.test(url);
}

/** Conexão privilegiada (ignora RLS). Usada só nos Route Handlers. */
export function db(): Sql {
  if (!globalThis.__alergiaSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não configurada.');
    globalThis.__alergiaSql = postgres(url, {
      // Compatível com o pooler do Supabase em modo transação (porta 6543).
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isLocal(url) ? false : 'require',
      onnotice: () => {},
    });
  }
  return globalThis.__alergiaSql;
}

/** Permite injetar uma conexão (testes de integração). */
export function setDb(sql: Sql | undefined) {
  globalThis.__alergiaSql = sql;
}

/** Parâmetro jsonb (evita dupla serialização de strings). */
export function json(sql: Sql | Tx, value: unknown) {
  return sql.json(value as postgres.JSONValue);
}
