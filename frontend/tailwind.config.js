/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'card-flip': {
          '0%': { transform: 'rotateY(90deg) scale(0.9)', opacity: '0' },
          '60%': { transform: 'rotateY(-12deg) scale(1.05)', opacity: '1' },
          '100%': { transform: 'rotateY(0) scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
        'card-flip': 'card-flip 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};
