/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#141414',
        'surface-hover': '#1a1a1a',
        primary: '#ffffff',
        secondary: '#888888',
        accent: '#ffffff',
        'accent-hover': '#e5e5e5',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        'card-dark': '#0f0f0f',
        'card-light': '#171717',
        border: '#262626',
        muted: '#525252'
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif']
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 10px 30px rgba(0, 0, 0, 0.7)'
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 4s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.8s ease-out'
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 }
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 }
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 }
        }
      }
    }
  },
  plugins: []
};