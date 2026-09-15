/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    // .claude/worktrees/ can briefly contain a full nested checkout (its own
    // src/**/*.test.* files) between finishing a worktree-based task and its
    // cleanup — exclude it so a merge run from the main checkout never
    // double-counts tests from a not-yet-removed worktree.
    exclude: ['node_modules/**', 'dist/**', '.claude/**'],
  },
})
