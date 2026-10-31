/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#e8e8ec',
        surface: 'rgba(255, 255, 255, 0.55)',
        'surface-hover': 'rgba(255, 255, 255, 0.75)',
        primary: '#0a0a0a',
        secondary: '#52525b',
        accent: '#0a0a0a',
        'accent-hover': '#27272a',
        success: '#16a34a',
        warning: '#ca8a04',
        error: '#dc2626',
        'card-dark': 'rgba(255, 255, 255, 0.5)',
        'card-light': 'rgba(255, 255, 255, 0.7)',
        border: 'rgba(0, 0, 0, 0.08)',
        'studio-border': '#c5c5cb',
        'studio-border-soft': '#d4d4d8',
        muted: '#a1a1aa',
        glass: {
          border: '#c5c5cb',
          highlight: '#a1a1aa',
          fill: 'rgba(255, 255, 255, 0.55)',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
        normal: '-0.01em',
        wide: '0.02em',
      },
      backdropBlur: {
        glass: '20px',
        'glass-lg': '40px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'card-hover':
          '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
        glow: '0 4px 20px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 4s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.8s ease-out',
        scroll: 'scroll 40s linear infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        scroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
  safelist: ['border-studio-border', 'border-studio-border-soft'],
};
