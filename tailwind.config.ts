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
          gold: '#B8860B',
        },
      },
    },
  },
  plugins: [],
}

export default config
