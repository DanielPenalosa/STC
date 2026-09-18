import type { Config } from "tailwindcss";

/**
 * Official Santa Cruz, Laguna palette:
 *   deep navy   #030B65  — main backgrounds, headers, primary branding
 *   royal blue  #2333A0  — primary UI elements, buttons, important sections
 *   bright cyan #06ABEA  — accents, highlights, links, interactive elements
 *   red         #DF1B2C  — alerts, errors, important notices
 *   yellow      #F5E606  — highlights, icons, callouts, status indicators
 *   green       #2E8254  — nature, community, progress, success
 *   off white   #F9F9F9  — main background, cards, containers
 *   black       #060606  — text, icons, borders, contrast
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // brand aliases
        navy: "#030B65",
        royal: "#2333A0",
        cyan: "#06ABEA",
        "sc-red": "#DF1B2C",
        "sc-yellow": "#F5E606",
        "sc-green": "#2E8254",

        /** primary = royal blue scale (buttons, links, active states) */
        primary: {
          50: "#eef0fc",
          100: "#dfe3f8",
          200: "#c3caf1",
          300: "#9aa4e6",
          400: "#5c6cc9",
          500: "#3a4ab4",
          600: "#2333A0", // royal blue — base
          700: "#1d2a83",
          800: "#172163",
          900: "#0d1650",
          950: "#030B65", // deep navy
        },
        /** cyan — accents, links, highlights */
        accent: {
          50: "#e8f7fe",
          100: "#d0eefd",
          200: "#a4dcfa",
          300: "#62c4f6",
          400: "#2cb4f1",
          500: "#06ABEA", // base
          600: "#0589bd",
          700: "#086d95",
          800: "#0c5b7a",
          900: "#0e4c66",
          950: "#073245",
        },
        /** success green — resolved, progress */
        success: {
          50: "#ebf4f0",
          100: "#d5e8df",
          200: "#aed2bf",
          300: "#7db49a",
          400: "#519878",
          500: "#3d7f62",
          600: "#2E8254", // base
          700: "#266944",
          800: "#1f5337",
          900: "#1a442e",
          950: "#0c2519",
        },
        /** alert red — errors, urgent */
        danger: {
          50: "#fdf0f1",
          100: "#fbdbdd",
          200: "#f6babd",
          300: "#f08c92",
          400: "#e94e59",
          500: "#DF1B2C", // base
          600: "#c51424",
          700: "#a50f1e",
          800: "#880e1a",
          900: "#731019",
          950: "#400509",
        },
        /** highlight yellow */
        warn: {
          50: "#fefdea",
          100: "#fdfbc4",
          200: "#fbf78e",
          300: "#f7ef4a",
          400: "#F5E606", // base
          500: "#d3c405",
          600: "#a89a04",
          700: "#827806",
          800: "#6b610b",
          900: "#5b520e",
          950: "#373104",
        },
        /** off-white page/card background */
        surface: {
          DEFAULT: "#F9F9F9",
          dark: "#f1f1f2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
