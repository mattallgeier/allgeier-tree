import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change 'allgeier-tree' to your GitHub repo name before deploying
export default defineConfig({
  plugins: [react()],
  base: '/allgeier-tree/',
})
