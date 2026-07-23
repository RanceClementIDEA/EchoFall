import { defineConfig } from 'vite'

// Config Vite : serveur de dev + build. `base: './'` garde des chemins
// relatifs pour que le build fonctionne aussi bien sur GitHub Pages,
// Vercel ou itch.io.
export default defineConfig({
  base: './',
  // Config PostCSS inline vide : empêche Vite de remonter l'arborescence et
  // de charger le postcss.config.js d'un projet parent (ce dépôt en contient
  // un, lié à Tailwind, sans rapport avec ce jeu).
  css: {
    postcss: {},
  },
  server: {
    host: true,
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
