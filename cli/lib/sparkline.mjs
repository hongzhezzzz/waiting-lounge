// Unicode-block sparkline.
//
// Maps a series of numbers into a single line of block characters
// `▁▂▃▄▅▆▇█`, normalized by min/max. Used by the Stock Direction
// round to visualize 30 minutes of price history (and the full 60
// minutes on reveal).

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values) {
  if (!Array.isArray(values) || values.length === 0) return "";
  const finite = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (finite.length === 0) return "";
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1; // avoid div0; flat line → all middle block
  return values
    .map((v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return " ";
      const norm = (v - min) / span;
      const idx = Math.min(BLOCKS.length - 1, Math.max(0, Math.round(norm * (BLOCKS.length - 1))));
      return BLOCKS[idx];
    })
    .join("");
}
