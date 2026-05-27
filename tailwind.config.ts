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
          // Brand theme: Teal primary + Amber accent.
          primary: '#0D9488',
          'primary-dark': '#0F766E',
          'primary-light': '#CCFBF1',
          accent: '#D97706',
          'accent-light': '#FFEDD5',
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
