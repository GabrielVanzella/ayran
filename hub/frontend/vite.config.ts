import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Publicada em vztecnologia.com.br/ayran: tudo (assets e chamadas de API) fica sob /ayran.
// Em dev, a API vem do backend da central (porta 3000).
export default defineConfig({
  base: '/ayran/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ayran/api': 'http://127.0.0.1:3000',
      '/ayran/owui': 'http://127.0.0.1:3000',
    },
  },
})
