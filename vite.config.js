import fs from 'node:fs'
import { SUPPORT_SERVICES } from './src/config/helplines.js'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'verified-offline-support',
    writeBundle(options) {
      const source = fs.readFileSync('public/service-worker.js', 'utf8')
      fs.writeFileSync(options.dir + '/service-worker.js', source.replace('/* VERIFIED_SUPPORT_SERVICES */ []', JSON.stringify(SUPPORT_SERVICES.map(({ name, phone, tel, hours }) => ({ name, phone, tel, hours })))))
    },
  }],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
})
