import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to backend/.env or your environment.");
  }
  pool = new Pool({
    connectionString: url,
    // Supabase + most managed Postgres providers require SSL.
    ssl: shouldUseSSL(url) ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[db] pool error", err.message);
  });
  return pool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  const p = getPool();
  const res = await p.query<T>(text, params as never);
  return { rows: res.rows };
}

// Run a callback inside a Postgres transaction. The callback receives a
// dedicated client; queries on that client share the transaction. Auto-
// commits on success, rolls back on throw, and always releases the client.
export async function withTx<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function applySchema(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(here, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await getPool().query(sql);
  console.log(`[db] schema applied (${schemaPath})`);
}

export async function pingDb(): Promise<boolean> {
  try {
    const res = await getPool().query<{ ok: number }>("select 1 as ok");
    return res.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

function shouldUseSSL(connectionString: string): boolean {
  // Common managed Postgres providers — assume SSL unless explicitly disabled.
  if (process.env.DATABASE_SSL === "false") return false;
  const lower = connectionString.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("supabase.co")) return true;
  if (lower.includes("supabase.com")) return true;
  if (lower.includes("render.com")) return true;
  if (lower.includes("neon.tech")) return true;
  if (lower.includes("railway")) return true;
  // Default to SSL — safer for unknown remote hosts. Local Postgres can opt
  // out via DATABASE_SSL=false.
  if (lower.startsWith("postgres://localhost") || lower.startsWith("postgresql://localhost")) {
    return false;
  }
  return true;
}
