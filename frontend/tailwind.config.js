/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vts-green': '#10B981',
        'vts-amber': '#F59E0B',
        'vts-red': '#EF4444',
        'vts-navy': '#1E293B',
      },
    },
  },
  plugins: [],
}