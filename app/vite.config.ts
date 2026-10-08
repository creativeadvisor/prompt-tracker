import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    // Router options live in tsr.config.json so this plugin and
    // scripts/generate-routes.mjs can't drift apart.
    tanstackRouter(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor libs change on dependency bumps, app code changes every
        // deploy — separate chunks so a deploy doesn't bust the browser's
        // cache of react/supabase/tanstack (the bulk of the old 545KB
        // single entry that warned on every build since PR #4).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return 'react'
          if (id.includes('node_modules/@supabase/')) return 'supabase'
          if (id.includes('node_modules/@tanstack/')) return 'tanstack'
          return 'vendor'
        },
      },
    },
  },
})
