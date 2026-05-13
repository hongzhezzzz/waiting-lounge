// Waiting Lounge — TUI design system.
//
// This module is the single source of truth for the terminal UI's
// visual identity. Every component imports from here so that color,
// spacing, key-label format, and copy style stay consistent across
// every screen.
//
// Design principles
// -----------------
// 1. Semantic color, not literal. Components say `C.success`, not
//    "green". This makes a future re-theme a one-file change.
// 2. Visual hierarchy through weight, not shouting. Bold + brand
//    color for active CTAs and section titles; plain text for body
//    copy; dimColor for hints and secondary metadata. We never use
//    ALL CAPS as emphasis.
// 3. Consistent key labels everywhere: `[K]` — bracketed, bold,
//    brand-colored. Disabled keys are dimmed (no brackets-color).
//    No `Press X` prose; no `K = action` list-style; no `^L` without
//    brackets. Only `[K] verb` everywhere.
// 4. One-line footers. Every scene ends with a single dimmed footer
//    line listing every key that works right now, separated by
//    ` · ` (middle dot with spaces).
// 5. Quiet ellipsis. Always Unicode `…`, never three periods. Used
//    for transient states (searching…, locked … waiting…). No double
//    punctuation (avoid `text. …`).
// 6. Imperative + lowercase after [K]. `[F] find a match`, never
//    `[F] Find a match` or `[F] find a match.`. The bracket separates
//    the key from the verb visually so capitalization is redundant.

import { Box, Text } from "ink";
import { createElement as h } from "react";

// ---------------------------------------------------------------------
// Color tokens. ink/chalk color names. Pick from cyan, green, yellow,
// red, magenta, blue, gray, white. Use `dimColor: true` for muted text.
// ---------------------------------------------------------------------
export const C = {
  brand: "cyan",        // app identity, primary CTA, active key, section title
  success: "green",     // locked answer, winner, healthy state, my chips
  warning: "yellow",    // timer, transient/searching state, soft warnings
  danger: "red",        // errors, loss, forfeit
  peer: "magenta",      // opponent identity, opponent's chips
  link: "blue",         // hyperlinks (pair URL, etc.)
};

// ---------------------------------------------------------------------
// Border styles. Three tiers map to visual weight.
// ---------------------------------------------------------------------
export const B = {
  primary: "round",     // primary panels (chip bar, brand banner, reconnect)
  panel: "single",      // nested content boxes (prompts, code, chat)
  strong: "double",     // strong containers (cards, match-end, confirm modal)
};

// ---------------------------------------------------------------------
// Brand identity.
// ---------------------------------------------------------------------
export const BRAND = {
  icon: "☕",
  name: "Waiting Lounge",
  tagline: "play while your agent works",
};

// ---------------------------------------------------------------------
// Round-type metadata. One source of truth for the icon and display
// title each round renderer (and any hint/header) shows.
// ---------------------------------------------------------------------
export const ROUND_META = {
  indian_poker:    { icon: "🃏", title: "Indian Poker" },
  estimation:      { icon: "📊", title: "Estimation" },
  monty_mirage:    { icon: "🎲", title: "Monty Mirage" },
  chicken:         { icon: "🐔", title: "Chicken Numbers" },
  big_o:           { icon: "⚙",  title: "Big-O Showdown" },
  geo_trivia:      { icon: "🌍", title: "Geo Trivia" },
  stock_direction: { icon: "📈", title: "Stock Direction" },
};

// ---------------------------------------------------------------------
// Components.
// ---------------------------------------------------------------------

// Key — render `[K]` in bold brand color (default), or dimmed when
// disabled (e.g. a bet tier the player can't afford). Use everywhere
// a keystroke appears in the UI. Optional `color` overrides the brand
// for special semantics: green when the key represents a locked
// action, yellow for an active warning toggle, etc.
export function Key({ label, color = C.brand, disabled = false, locked = false }) {
  if (disabled) {
    return h(Text, { dimColor: true }, `[${label}]`);
  }
  return h(Text, { color: locked ? C.success : color, bold: true }, `[${label}]`);
}

// Hint — single dimmed line showing the keys that work right now.
// `items` is an array of strings or [Key, " label"] pairs. Items are
// joined with ` · ` (middle dot). Pass exactly the active items for
// the current state — never list keys that don't do anything here.
export function Hint({ items }) {
  const flat = [];
  items.forEach((item, i) => {
    if (i > 0) flat.push(h(Text, { key: `s${i}`, dimColor: true }, "  ·  "));
    if (typeof item === "string") {
      flat.push(h(Text, { key: i, dimColor: true }, item));
    } else {
      // item is [keyLabel, suffix] — render Key + dim suffix
      const [label, suffix, opts = {}] = item;
      flat.push(h(Box, { key: i },
        h(Key, { label, ...opts }),
        h(Text, { dimColor: true }, suffix),
      ));
    }
  });
  return h(Box, null, ...flat);
}

// Title — "<icon> <text>" in bold brand color. Used for scene
// titles and section headers (e.g. "🃏 Indian Poker", "💬 chat").
export function Title({ icon, text, color = C.brand }) {
  const s = icon ? `${icon} ${text}` : text;
  return h(Text, { color, bold: true }, s);
}

// Banner — brand identity at the top of every full-screen scene.
// Compact when expanded=false (just the title), expanded=true shows
// title + tagline.
export function Banner({ expanded = true }) {
  return h(Box, {
    borderStyle: B.primary,
    borderColor: C.brand,
    paddingX: 2,
    paddingY: 0,
    alignSelf: "flex-start",
  },
    h(Text, { bold: true, color: C.brand }, `${BRAND.icon} ${BRAND.name}`),
    expanded ? h(Text, { dimColor: true }, `  ${BRAND.tagline}`) : null,
  );
}

// Footer — render an array of `[label, suffix]` items at the bottom
// of a scene, separated by middle dots, all dimmed with the keys
// brand-emphasized. Convenience wrapper around Hint with a marginTop.
export function Footer({ items }) {
  return h(Box, { marginTop: 1 },
    h(Hint, { items }),
  );
}

// Phase pill — "Round 3 of 5 · bet phase · 8s left". Compact dim
// status row used during a match. Each segment can be optionally
// emphasized by passing a color in the `parts` array: "string" or
// { text, color, bold }.
export function PhasePill({ parts }) {
  const out = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(h(Text, { key: `s${i}`, dimColor: true }, " · "));
    if (typeof p === "string") {
      out.push(h(Text, { key: i, dimColor: true }, p));
    } else {
      out.push(h(Text, { key: i, color: p.color, bold: p.bold, dimColor: !p.color }, p.text));
    }
  });
  return h(Box, null, ...out);
}
