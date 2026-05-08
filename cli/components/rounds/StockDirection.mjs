// Stock Direction — predict next 30-min direction (Up/Down) and
// magnitude (%). Sub-state: pick direction first (U/D), then type
// magnitude digits. Backspace at empty magnitude returns to direction
// picker.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { sparkline } from "../../lib/sparkline.mjs";

export function StockDirectionRound({ payload, phase, numericInput, stockDir, myAnswer }) {
  const visible = payload?.visiblePrices || [];
  const magMax = payload?.magnitudeMax ?? 20;
  const line = sparkline(visible);

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "📈 Stock Direction"),
    h(Box, { marginTop: 1, borderStyle: "single", borderColor: "gray", paddingX: 1, paddingY: 0, flexDirection: "column" },
      h(Text, { color: "yellow" }, line || "(no data)"),
      h(Text, { dimColor: true }, `Last 30 min · ${visible.length} bars`),
    ),
    h(Text, { dimColor: true }, `Predict: direction (Up/Down) + magnitude 0–${magMax}%`),

    phase === "answer"
      ? (myAnswer
          ? h(Box, { marginTop: 1 },
              h(Text, { color: "green" },
                `Locked: ${myAnswer.direction === "up" ? "↑ Up" : "↓ Down"} by ${myAnswer.magnitude}%. Waiting…`,
              ),
            )
          : (stockDir == null
              ? h(Box, { marginTop: 1 },
                  h(Text, { color: "cyan" }, "[U] Up"),
                  h(Text, null, "    "),
                  h(Text, { color: "cyan" }, "[D] Down"),
                )
              : h(Box, { marginTop: 1, flexDirection: "column" },
                  h(Text, null,
                    "Direction: ",
                    h(Text, { color: "yellow", bold: true },
                      stockDir === "up" ? "↑ Up" : "↓ Down",
                    ),
                  ),
                  h(Box, null,
                    h(Text, null, "Magnitude: "),
                    h(Text, { color: "yellow", bold: true }, numericInput || "_"),
                    h(Text, { dimColor: true }, "% (digits + . + Enter; backspace to change direction)"),
                  ),
                )))
      : phase === "bet"
      ? h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Bet phase open above; answer phase opens after."),
        )
      : h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Reveal phase — bet phase opens shortly."),
        ),
  );
}
