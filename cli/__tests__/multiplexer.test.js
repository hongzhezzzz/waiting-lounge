// Stage 6c — unit tests for the lounge-byte translator.
// Run: node --test cli/__tests__/multiplexer.test.js

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { translateLoungeChunk } = require("../multiplexer.js");

const OFFSET = 20; // pretend the top region is 20 rows

test("plain text passes through unchanged", () => {
  assert.equal(translateLoungeChunk("hello world", OFFSET), "hello world");
});

test("CUP shifts row coordinate", () => {
  assert.equal(translateLoungeChunk("\x1B[5;1H", OFFSET), "\x1B[25;1H");
});

test("HVP shifts row coordinate (rare but valid)", () => {
  assert.equal(translateLoungeChunk("\x1B[3;10f", OFFSET), "\x1B[23;10f");
});

test("Home translates to offset+1, col 1", () => {
  assert.equal(translateLoungeChunk("\x1B[H", OFFSET), "\x1B[21;1H");
});

test("CUP row-only adds default col=1", () => {
  assert.equal(translateLoungeChunk("\x1B[5H", OFFSET), "\x1B[25;1H");
});

test("VPA shifts row coordinate", () => {
  assert.equal(translateLoungeChunk("\x1B[7d", OFFSET), "\x1B[27d");
});

test("multiple escapes in one chunk all shift", () => {
  assert.equal(
    translateLoungeChunk("\x1B[1;1Hhello\x1B[2;1Hworld", OFFSET),
    "\x1B[21;1Hhello\x1B[22;1Hworld"
  );
});

test("color escapes pass through", () => {
  assert.equal(translateLoungeChunk("\x1B[31mred\x1B[0m", OFFSET), "\x1B[31mred\x1B[0m");
});

test("scroll-region escape blocked (lounge can't fight ours)", () => {
  assert.equal(translateLoungeChunk("\x1B[1;5r", OFFSET), "");
});

test("alt-screen escape blocked (multiplexer owns alt-screen)", () => {
  assert.equal(translateLoungeChunk("\x1B[?1049h", OFFSET), "");
  assert.equal(translateLoungeChunk("\x1B[?1049l", OFFSET), "");
});

test("clear-screen blocked (would wipe claude's region)", () => {
  assert.equal(translateLoungeChunk("\x1B[2J", OFFSET), "");
});

test("UTF-8 emoji passes through", () => {
  assert.equal(translateLoungeChunk("\x1B[1;1H☕ Lounge", OFFSET), "\x1B[21;1H☕ Lounge");
});
