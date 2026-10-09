/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        agri: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#15803d',
          600: '#166534',
          700: '#14532d',
          green: '#005F3E',
          'green-hover': '#004d32',
          red: '#A81D22',
          'red-light': '#FDF2F2',
          yellow: '#F2A900',
          'yellow-hover': '#d99700',
          bg: '#F4F6F8',
          card: '#FFFFFF',
          border: '#E2E8F0',
        }
      }
    },
  },
  plugins: [],
}
