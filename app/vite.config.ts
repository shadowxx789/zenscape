import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // 不自动接管，避免会话中页面被重置
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: '竹间息 BreezeScape',
        short_name: '竹间息',
        description: '风过竹林，声声不住，念念不停。生成式冥想声景。',
        theme_color: '#07110f',
        background_color: '#07110f',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        start_url: './',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,woff,woff2}'],
        // 不自动 skipWaiting，避免播放中页面被新 SW 接管
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  base: '/zenscape/', // GitHub Pages 子目录
})
