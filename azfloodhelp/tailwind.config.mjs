/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        navy: '#1B365D',
        amber: '#D4A853',
        warm: '#F5F3F0',
        charcoal: '#2D2D2D',
        check: '#4A7C59',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: {
        reading: '720px',
      },
    },
  },
  plugins: [],
};
