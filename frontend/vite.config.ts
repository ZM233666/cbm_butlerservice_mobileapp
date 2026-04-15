import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * 后端地址——只需在这里改一处即可。
 * `node server/server.js`      → http://127.0.0.1:3100
 * `npm run start:https`        → https://127.0.0.1:3100
 * 也可通过环境变量覆盖：VITE_PROXY_TARGET=http://127.0.0.1:3100
 */
const API_TARGET = process.env.VITE_PROXY_TARGET || 'https://127.0.0.1:3100'

const proxyOpts = {
  target: API_TARGET,
  changeOrigin: true,
  secure: false,
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': proxyOpts,
      '/uploads': proxyOpts,
      '/PicSamples': proxyOpts,
      '/data': proxyOpts,
    },
  },
})
