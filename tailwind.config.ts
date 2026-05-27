import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        yoi: {
          purple: '#5B21B6',
          'purple-dark': '#4C1D95',
          'purple-light': '#EDE9FE',
          gold: '#B8860B',
          'gold-light': '#FEF3C7',
        },
        // Semantic scale — one source of truth for status meaning.
        success: { DEFAULT: '#16A34A', light: '#F0FDF4', text: '#15803D' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB', text: '#B45309' },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2', text: '#B91C1C' },
      },
    },
  },
  plugins: [],
}

export default config
