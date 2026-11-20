import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
// @ts-expect-error – reines JS-Modul ohne Typen (läuft auf Vercel als Funktion)
import soundHandler from './api/sound.js'

/** Stellt /api/sound auch lokal bereit (npm run dev / preview), wie auf Vercel. */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/sound', (req, res) => void soundHandler(req, res))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/sound', (req, res) => void soundHandler(req, res))
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  build: {
    // recharts allein ist ~540 kB (unkomprimiert) – bewusst eigener Chunk
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
})
