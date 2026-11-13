import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Precache the self-hosted fonts too, so the stall and student phones render offline.
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'], navigateFallback: '/index.html' },
      manifest: {
        name: 'HeronPay',
        short_name: 'HeronPay',
        description: 'Pay at campus stalls with your UMak ID, even with no signal.',
        theme_color: '#10141F',
        background_color: '#10141F',
        display: 'standalone',
        start_url: '/app',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
