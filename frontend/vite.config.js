import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'https://restaurantbackend-production-8e87.up.railway.app'

const proxy = {
  target: BACKEND,
  changeOrigin: true,
  secure: false,
  timeout: 30000,
  proxyTimeout: 30000,
  configure: (p) => {
    p.on('error', (err, _req, res) => {
      console.error('[proxy error]', err.message)
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ detail: `Backend unavailable — Railway may be sleeping. Try again in 30s.` }))
      }
    })
    p.on('proxyReq', (_pr, req) => {
      console.log('[proxy →]', req.method, req.url)
    })
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/company':          proxy,
      '/users':            proxy,
      '/userroles':        proxy,
      '/userrolemappings': proxy,
      '/menu':             proxy,
      '/pos':              proxy,
      '/static':           proxy,
    },
  },
})
