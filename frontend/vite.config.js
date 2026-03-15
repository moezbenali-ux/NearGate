import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/badges': 'http://localhost:8000',
      '/etats': 'http://localhost:8000',
      '/evenements': 'http://localhost:8000',
      '/config': 'http://localhost:8000',
      '/utilisateurs': 'http://localhost:8000',
      '/ping': 'http://localhost:8000',
    }
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  }
})
