import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// frappe-gantt's package "exports" does not expose its stylesheet, so alias it.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { 'frappe-gantt-css': fileURLToPath(new URL('./node_modules/frappe-gantt/dist/frappe-gantt.css', import.meta.url)) },
  },
})
