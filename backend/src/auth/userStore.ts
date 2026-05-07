// Application-level user data: handle, points, device bindings.
// Keyed off email (Supabase Auth's natural identifier) — a separate UUID
// per row keeps us decoupled from Supabase auth.users in case we migrate
// auth providers later.

import { query } from "../db/index.js";
import { generateHandle } from "../lib/identity.js";

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
