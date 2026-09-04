import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/main/services/__tests__/**/*.test.ts',
      'src/renderer/src/lib/__tests__/**/*.test.ts'
    ],
    testTimeout: 15000
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
