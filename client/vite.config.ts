import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward any request starting with /api to the Express server on :4000.
    // This means the browser only ever talks to :5173, so there is no CORS to
    // configure on the server side.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
