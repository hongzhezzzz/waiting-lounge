// Supabase JWT verification.
//
// Supabase projects can be in one of two modes:
// - Legacy: tokens signed with HS256 using SUPABASE_JWT_SECRET (the old
//   "JWT Secret" string from Project Settings).
// - Modern: tokens signed asymmetrically (RS256 / ES256) with a key the
//   server publishes at /auth/v1/.well-known/jwks.json.
//
// We support both. JWKS first (current default for new tokens), HS256 as
// fallback (so legacy projects and locally-minted test tokens still work).

import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

let cachedHsKey: Uint8Array | null = null;
function getHsKey(): Uint8Array | null {
  if (cachedHsKey) return cachedHsKey;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  cachedHsKey = new TextEncoder().encode(secret);
  return cachedHsKey;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (cachedJwks) return cachedJwks;
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  cachedJwks = createRemoteJWKSet(new URL(`${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`));
  return cachedJwks;
}

export type AuthClaims = {
  userSub: string;       // Supabase auth.users.id
  email: string;
  expiresAt: number;     // unix seconds
};

export async function verifySupabaseJwt(token: string): Promise<AuthClaims> {
  let payload: JWTPayload | null = null;

  const jwks = getJwks();
  if (jwks) {
    try {
      const res = await jwtVerify(token, jwks, {
        algorithms: ["RS256", "ES256"],
      });
      payload = res.payload;
    } catch {
      // fall through to HS256
    }
  }

  if (!payload) {
    const hs = getHsKey();
    if (!hs) {
      throw new Error("Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is set.");
    }
    const res = await jwtVerify(token, hs, { algorithms: ["HS256"] });
    payload = res.payload;
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!sub || !email) throw new Error("Token missing sub/email");
  return { userSub: sub, email, expiresAt: exp };
}
