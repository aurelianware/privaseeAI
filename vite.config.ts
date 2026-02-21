import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: true,
    port: 3000
  },
  build: {
    target: 'es2020',
    sourcemap: true
  },
  optimizeDeps: {
    include: ['@tensorflow/tfjs', '@tensorflow/tfjs-backend-webgl']
  },
  define: {
    global: 'globalThis',
    'process.env': {}
  }
})

