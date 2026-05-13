// Stock Direction — predict next 30-min direction (Up/Down) and
// magnitude (%). Sub-state: pick direction first (U/D), then type
// magnitude digits. Backspace at empty magnitude returns to direction
// picker.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { sparkline } from "../../lib/sparkline.mjs";
import { C, B, Key, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function StockDirectionRound({ payload, phase, numericInput, stockDir, myAnswer }) {
  const meta = ROUND_META.stock_direction;
  const visible = payload?.visiblePrices || [];
  const magMax = payload?.magnitudeMax ?? 20;
  const line = sparkline(visible);

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, `Predict the next 30 min: direction + magnitude (0–${magMax}%).`),

    h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      flexDirection: "column",
    },
      h(Text, { color: C.warning }, line || "(no data)"),
      h(Text, { dimColor: true }, `last 30 min  ·  ${visible.length} bars`),
    ),

    phase === "answer"
      ? (myAnswer
          ? h(LockedLine, null,
              `${myAnswer.direction === "up" ? "↑ up" : "↓ down"} by ${myAnswer.magnitude}%`,
            )
          : (stockDir == null
              ? h(Box, { marginTop: 1 },
                  h(Key, { label: "U" }), h(Text, null, " up"),
                  h(Text, null, "     "),
                  h(Key, { label: "D" }), h(Text, null, " down"),
                )
              : h(Box, { marginTop: 1, flexDirection: "column" },
                  h(Box, null,
                    h(Text, null, "direction  "),
                    h(Text, { color: C.warning, bold: true },
                      stockDir === "up" ? "↑ up" : "↓ down",
                    ),
                  ),
                  h(Box, null,
                    h(Text, null, "magnitude  "),
                    h(Text, { color: C.warning, bold: true }, numericInput || "_"),
                    h(Text, { dimColor: true }, "%  digits + Enter; Backspace to change direction"),
                  ),
                )))
      : h(PhaseHint, { phase }),
  );
}
