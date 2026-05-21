// Stage 12b — room code helper tests.
// Run via `node --test backend/src/lib/__tests__/roomCode.test.mjs`
// against the compiled output, or directly against the .ts source
// after a build. We re-import the source via the tsx loader path so
// the file works either way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from "../roomCode.ts";

test("generateRoomCode produces 6 chars from the safe alphabet", () => {
  const seen = new Set();
  const taken = (c) => seen.has(c);
  for (let i = 0; i < 50; i++) {
    const c = generateRoomCode(taken);
    assert.equal(c.length, 6);
    assert.match(c, /^[BCDEFGHJKMNPQRSTVWXYZ23456789]{6}$/);
    seen.add(c);
  }
});

test("normalizeRoomCode uppercases and strips spaces/dashes", () => {
  assert.equal(normalizeRoomCode("k7xqm4"), "K7XQM4");
  assert.equal(normalizeRoomCode(" K7-XQM4 "), "K7XQM4");
  assert.equal(normalizeRoomCode("k 7-x-q-m-4"), "K7XQM4");
});

test("isValidRoomCode accepts valid alphabet only", () => {
  assert.equal(isValidRoomCode("K7XQM4"), true);
  assert.equal(isValidRoomCode("k7xqm4"), false); // lowercase
  assert.equal(isValidRoomCode("K7XQM"), false);  // too short
  assert.equal(isValidRoomCode("K7XQM44"), false); // too long
  assert.equal(isValidRoomCode("K0XQM4"), false); // 0 not in alphabet
  assert.equal(isValidRoomCode("K1XQM4"), false); // 1 not in alphabet
  assert.equal(isValidRoomCode("KOXQM4"), false); // O not in alphabet
  assert.equal(isValidRoomCode("KIXQM4"), false); // I not in alphabet
  assert.equal(isValidRoomCode("KLXQM4"), false); // L not in alphabet
});
