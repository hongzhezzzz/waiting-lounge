import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#FAF7F2",
        surface: "#FFFFFF",
        ink: "#2A2926",
        muted: "#7A756D",
        line: "#E8E2D7",
        sage: {
          DEFAULT: "#7FA98A",
          soft: "#DFE9DD",
          deep: "#5C8A6B",
        },
        amber: {
          DEFAULT: "#D89A3A",
          soft: "#FBEBC9",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular"],
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(42,41,38,0.04), 0 4px 12px rgba(42,41,38,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
