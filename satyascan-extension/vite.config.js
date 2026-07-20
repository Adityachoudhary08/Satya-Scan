import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared'),
    },
  },
  // Relative base so Chrome Extension popup resolves assets correctly.
  // Without this, Vite emits /assets/... (absolute) which 404s in extension context.
  base: './',

  // 'mpa' prevents Vite from intercepting manifest.json as a PWA manifest
  appType: 'mpa',
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: [
        resolve(__dirname),
        resolve(__dirname, '../shared'),
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        // ── Popup (React app) ──────────────────────────────────────────────
        popup: resolve(__dirname, 'index.html'),

        // ── Background service worker ──────────────────────────────────────
        // Compiled to dist/assets/background.js
        // Referenced in manifest.json as: "background": { "service_worker": "assets/background.js" }
        background: resolve(__dirname, 'src/background/index.js'),

        // ── Content script ─────────────────────────────────────────────────
        // Compiled to dist/assets/content.js
        // Referenced in manifest.json as the content scripts entry
        content: resolve(__dirname, 'src/content/index.js'),
      },
      output: {
        // No content hashes — Chrome Extension manifest references must be stable
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
  },
})
