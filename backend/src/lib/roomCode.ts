// Stage 12b — room codes for hosted rooms.
//
// 6-character codes from a no-ambiguity alphabet: dropped 0/O/1/I/L so a
// player reading a code out loud or off another screen doesn't mistype.
// 23 letters + 8 digits = 31 symbols, 31^6 ≈ 887M combinations — plenty
// for an in-memory registry that rarely has more than a few open rooms.

const ALPHABET = "BCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateRoomCode(taken: (code: string) => boolean): string {
  // Try 20 times; in practice we collide ~never. After 20 attempts we
  // give up and return whatever we have — the caller can re-roll.
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!taken(code)) return code;
  }
  // Fallback — caller can detect a collision by re-checking taken().
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// Normalize user-typed input: uppercase, strip whitespace + dashes. Lets
// the user type `k7-xqm4` or ` k7xqm4 ` and still join correctly.
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

// Strict format check (used by socket validation before lookup).
export function isValidRoomCode(input: string): boolean {
  if (input.length !== 6) return false;
  for (const ch of input) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
