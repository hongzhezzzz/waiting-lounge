#!/usr/bin/env node
// One-shot generator for the Stock Direction round bank.
//
//   cd backend && node scripts/gen-stock-bank.mjs
//
// Produces src/games/brainBet/stockDirectionBank.json with 40 windows.
// Each window has 60 synthetic price points. The first 30 are shown to
// players; the last 30 are the hidden "answer" continuation.
//
// Output is deterministic — uses a seeded LCG, no Math.random().

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, "..", "src", "games", "brainBet", "stockDirectionBank.json");

function makeLCG(seed) {
  // Numerical Recipes constants.
  let state = seed >>> 0;
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const PERSONALITIES = [
  "uptrend",
  "downtrend",
  "sideways",
  "choppy",
  "late_reversal",
  "head_fake",
];

// Walk 60 cumulative log-return-ish steps. drift + noise per personality.
function genWindow(rand, personality, startPrice = 100) {
  const prices = [startPrice];
  for (let i = 1; i < 60; i++) {
    let drift, noiseScale;
    if (personality === "uptrend") {
      drift = 0.0010 + rand() * 0.0015;
      noiseScale = 0.010;
    } else if (personality === "downtrend") {
      drift = -(0.0010 + rand() * 0.0015);
      noiseScale = 0.010;
    } else if (personality === "sideways") {
      drift = (rand() - 0.5) * 0.0006;
      noiseScale = 0.006;
    } else if (personality === "choppy") {
      drift = (rand() - 0.5) * 0.001;
      noiseScale = 0.022;
    } else if (personality === "late_reversal") {
      // Up first 30, down second 30 — visible window looks one way, hidden flips.
      drift = (i < 30 ? 0.0018 : -0.0022);
      noiseScale = 0.010;
    } else /* head_fake */ {
      // Visible window starts down, then sharply reverses up at i=20.
      // Hidden window continues the up move.
      drift = (i < 18 ? -0.0020 : 0.0020);
      noiseScale = 0.012;
    }
    const noise = (rand() - 0.5) * 2 * noiseScale;
    const ret = drift + noise;
    const next = prices[i - 1] * (1 + ret);
    prices.push(Math.max(1, next)); // floor to avoid negatives in degenerate cases
  }
  return prices.map((p) => Math.round(p * 100) / 100);
}

function main() {
  const rand = makeLCG(20260507);
  const windows = [];
  for (let i = 0; i < 40; i++) {
    const personality = PERSONALITIES[i % PERSONALITIES.length];
    // Burn a few rng draws so two windows of the same personality differ.
    rand(); rand(); rand();
    const prices = genWindow(rand, personality);
    const split = prices[29];
    const end = prices[59];
    const direction = end >= split ? "up" : "down";
    const magnitude = Math.round(Math.abs((end / split - 1) * 100) * 100) / 100;
    windows.push({
      id: `stock_${personality}_${i.toString().padStart(2, "0")}`,
      prices,
      answer: { direction, magnitude },
      explanation: `${personality.replace(/_/g, " ")}: hidden 30 went from ${split.toFixed(2)} to ${end.toFixed(2)} (${direction === "up" ? "+" : "-"}${magnitude}%).`,
    });
  }
  writeFileSync(outPath, JSON.stringify(windows, null, 2));
  const ups = windows.filter((w) => w.answer.direction === "up").length;
  const downs = windows.length - ups;
  console.log(`Wrote ${windows.length} windows to ${outPath}`);
  console.log(`  ${ups} up, ${downs} down`);
  console.log(`  magnitudes: min=${Math.min(...windows.map((w) => w.answer.magnitude)).toFixed(2)}, max=${Math.max(...windows.map((w) => w.answer.magnitude)).toFixed(2)}, mean=${(windows.reduce((s, w) => s + w.answer.magnitude, 0) / windows.length).toFixed(2)}`);
}

main();
