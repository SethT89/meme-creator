import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vite.config.ts sets `globals: false`, so @testing-library/react's automatic
// cleanup-between-tests (which relies on detecting a global `afterEach`)
// never registers on its own. Register it explicitly instead — without this,
// DOM from one test leaks into the next test in the same file.
afterEach(() => {
  cleanup()
  // The editor keeps a draft in localStorage; without this one test's draft would be
  // restored into the next test's editor.
  localStorage.clear()
})
