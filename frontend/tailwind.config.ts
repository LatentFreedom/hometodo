import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables in app/globals.css.
        // Use these for surfaces/text so light/dark switch automatically;
        // never a hardcoded gray or hex value in a component.
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        divider: 'rgb(var(--divider) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        // Both come from next/font in app/layout.tsx, self-hosted at build time.
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
