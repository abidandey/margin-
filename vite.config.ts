import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the built game works at any address, including username.github.io/repo-name/.
  base: './',
  plugins: [react()],
})
