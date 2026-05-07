// Application-level user data: handle, points, device bindings.
// Keyed off email (Supabase Auth's natural identifier) — a separate UUID
// per row keeps us decoupled from Supabase auth.users in case we migrate
// auth providers later.

import { getPool, query } from "../db/index.js";
import { generateHandle } from "../lib/identity.js";

const REFILL_CAP = 1000;
const REFILL_AMOUNT = 100;
const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type AppUser = {
  id: string;
  email: string;
  handle: string;
  points: number;
};

export async function getOrCreateUser(email: string): Promise<AppUser> {
  const existing = await query<AppUser>(
    `select id, email, handle, points from users where email = $1`,
    [email],
  );
  if (existing.rows[0]) return existing.rows[0];

  const handle = generateHandle();
  const inserted = await query<AppUser>(
    `insert into users (email, handle, points) values ($1, $2, 1000)
     on conflict (email) do update set email = excluded.email
     returning id, email, handle, points`,
    [email, handle],
  );
  return inserted.rows[0];
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const r = await query<AppUser>(
    `select id, email, handle, points from users where id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function getBalance(userId: string): Promise<number | null> {
  const r = await query<{ points: number }>(
    `select points from users where id = $1`,
    [userId],
  );
  return r.rows[0]?.points ?? null;
}

export type BindResult =
  | { ok: true; bound: boolean }
  | { ok: false; reason: "device_taken_by_other" };

// Bind a device id to a user. Idempotent for the same user; rejects when
// the device is already bound to a different account.
export async function bindDevice(userId: string, deviceId: string): Promise<BindResult> {
  const existing = await query<{ user_id: string }>(
    `select user_id from device_account_bindings where device_id = $1`,
    [deviceId],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].user_id === userId) return { ok: true, bound: false };
    return { ok: false, reason: "device_taken_by_other" };
  }
  await query(
    `insert into device_account_bindings (device_id, user_id) values ($1, $2)
     on conflict (device_id) do nothing`,
    [deviceId, userId],
  );
  return { ok: true, bound: true };
}

export async function getDeviceBinding(deviceId: string): Promise<string | null> {
  const r = await query<{ user_id: string }>(
    `select user_id from device_account_bindings where device_id = $1`,
    [deviceId],
  );
  return r.rows[0]?.user_id ?? null;
}

// Lazy daily refill — adds up to 100 pts (capped at 1000) once every 24 h.
// Returns the amount actually credited (0 if the user is not yet eligible).
//
// Called only from /api/me — never from the socket middleware. Keeps the
// "first call sees refilledAmount > 0, second call sees 0" race away from
// any path other than the one that surfaces the toast.
//
// Atomic: SELECT ... FOR UPDATE on the user row, re-checks eligibility
// inside the lock before mutating, writes a point_transactions row.
export async function applyDailyRefill(userId: string): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const lock = await client.query<{ points: number; last_refill_at: string | null }>(
      `select points, last_refill_at from users where id = $1 for update`,
      [userId],
    );
    const row = lock.rows[0];
    if (!row) {
      await client.query("commit");
      return 0;
    }
    if (!eligibleForRefill(row.last_refill_at, row.points)) {
      await client.query("commit");
      return 0;
    }

    const amount = Math.min(REFILL_AMOUNT, REFILL_CAP - row.points);
    if (amount <= 0) {
      await client.query("commit");
      return 0;
    }

    await client.query(
      `update users set points = points + $1, last_refill_at = now() where id = $2`,
      [amount, userId],
    );
    await client.query(
      `insert into point_transactions (user_id, delta, reason) values ($1, $2, 'daily_refill')`,
      [userId, amount],
    );

    await client.query("commit");
    return amount;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

function eligibleForRefill(lastRefillAt: string | null, points: number): boolean {
  if (points >= REFILL_CAP) return false;
  if (lastRefillAt == null) return true;
  const ageMs = Date.now() - new Date(lastRefillAt).getTime();
  return ageMs >= REFILL_COOLDOWN_MS;
}
