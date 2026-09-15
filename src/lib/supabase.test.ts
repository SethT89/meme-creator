import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(import('./supabase')).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('creates a client when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabase } = await import('./supabase')
    expect(supabase).toBeDefined()
  })
})
