// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content:[
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Bricolage Grotesque', 'sans-serif'],
        mono:['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#0a0a0a',
        surface: '#121212',
      }
    },
  },
  plugins:[],
}