import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api へのリクエストは Django(8000) に中継する。
// こうすることで CORS 設定が不要になり、本番でも同一オリジン配信に寄せやすい。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
