import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Build « single-file » : produit UN seul .html autonome (Phaser + jeu + CSS
 * inlinés), lançable d'un double-clic depuis le disque (file://) — sans
 * serveur ni outil à installer. Sortie dans `dist-single/`.
 *
 *   npm run build:single   →   dist-single/index.html
 *
 * `inlineDynamicImports` + le plugin garantissent qu'il n'y a AUCUNE requête
 * réseau (tout est embarqué), condition d'un fichier réellement portable.
 */
export default defineConfig({
  base: './',
  css: { postcss: {} },
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    // Un seul bundle, aucun chunk séparé.
    rollupOptions: { output: { inlineDynamicImports: true } },
    // Le HTML devient volumineux (Phaser inliné) : on relève les seuils.
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
  },
})
