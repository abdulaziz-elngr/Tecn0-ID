import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Tecno brand system — derived from the official logo
        tecno: {
          gold: "#F0B429",
          "gold-dark": "#C98A0C",
          "gold-light": "#FBD980",
          charcoal: "#1A1A1A",
          "charcoal-soft": "#262626",
          ink: "#0D0D0D"
        },
        surface: {
          light: "#FFFFFF",
          "light-muted": "#F7F7F5",
          dark: "#151515",
          "dark-muted": "#1E1E1E"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "IBM Plex Sans Arabic",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif"
        ]
      },
      borderRadius: {
        card: "0.75rem"
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
