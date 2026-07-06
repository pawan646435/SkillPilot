import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('firebase/')) return 'firebase'
          if (id.includes('react-router')) return 'router'
          // Match the react/react-dom packages themselves, not any package whose
          // path merely contains "/react/" as a substring — this previously also
          // matched @monaco-editor/react, leaking its loader into this eager chunk.
          if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/')) return 'react-vendor'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('lucide-react')) return 'icons'
        },
      },
    },
  },
})
