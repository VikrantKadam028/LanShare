/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ls: {
          bg:     '#0a0a0f',
          panel:  '#0e0e16',
          card:   '#14141e',
          border: 'rgba(255,255,255,0.06)',
          violet: '#8b5cf6',
          indigo: '#6366f1',
          emerald:'#10b981',
          rose:   '#f43f5e',
          amber:  '#f59e0b',
          text:   '#e2e8f0',
          muted:  '#64748b',
          subtle: '#1e1e2e',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'up-violet': '0 -4px 24px -4px rgba(139,92,246,0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } }
      }
    }
  },
  plugins: []
}
