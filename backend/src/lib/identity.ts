const COLORS = [
  "blue", "amber", "sage", "rust", "lilac", "olive", "coral", "slate",
  "warm", "quiet", "sleepy", "tiny", "wandering", "gentle", "loop", "soft",
];
const NOUNS = [
  "cursor", "compiler", "debugger", "stacktrace", "merge", "raccoon",
  "otter", "test", "branch", "patch", "fixture", "diff", "refactor",
  "linter", "buffer", "kernel",
];

export function generateHandle(): string {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${c}-${n}-${num}`;
}
