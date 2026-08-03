import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: 'vendor-http', test: /node_modules[\\/](axios)[\\/]/ },
            { name: 'vendor-i18n', test: /node_modules[\\/](i18next|react-i18next)[\\/]/ },
            { name: 'vendor-observe', test: /node_modules[\\/](posthog-js|@sentry|@sentry[\\/])[\\/]/ }
          ]
        }
      }
    }
  },
  server: {
    allowedHosts: ['.ngrok-free.dev', '.ngrok.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})
