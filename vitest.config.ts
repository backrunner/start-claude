import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    environment: 'node',
    include: ['packages/*/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'bin'],
  },
  resolve: {
    alias: {
      '@': new URL('./packages/cli/src', import.meta.url).pathname,
    },
  },
})
