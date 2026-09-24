import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 12000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              if (id.includes('geoData')) return 'geo-data';
              if (id.includes('ArtisanDirectory')) return 'artisan-directory';
              return undefined;
            }

            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('three') || id.includes('@react-three')) return 'three-vendor';
            if (id.includes('motion') || id.includes('framer-motion')) return 'motion-vendor';
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('lucide-react')) return 'icon-vendor';
            if (id.includes('country-state-city') || id.includes('libphonenumber-js')) return 'utility-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
