import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: { 'X-Frame-Options': 'ALLOWALL' }
  },
  preview: { host: '0.0.0.0', port: 5173 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'ORBITAL - Live Earth Observation Deck',
        short_name: 'ORBITAL',
        description: 'Real-time 3D visualization of every tracked satellite on Earth',
        theme_color: '#0a0e17',
        background_color: '#0a0e17',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/celestrak\.org\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'celestrak-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60*60*2 }, networkTimeoutSeconds: 10 }
          },
          {
            urlPattern: /^https:\/\/cdn\.star\.nesdis\.noaa\.gov\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'goes-cache', expiration: { maxAgeSeconds: 600 } }
          },
          {
            urlPattern: /^https:\/\/api\.adsb\.lol\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'adsb-cache', expiration: { maxAgeSeconds: 60 } }
          }
        ]
      }
    })
  ],
  worker: { format: 'es' }
})
