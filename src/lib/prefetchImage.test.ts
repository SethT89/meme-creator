import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A stand-in for the browser's Image that records what it was asked to load.
const created: { src: string; crossOrigin: string | null }[] = []
class FakeImage {
  src = ''
  crossOrigin: string | null = null
  decoding = ''
  constructor() {
    created.push(this)
  }
}

beforeEach(() => {
  created.length = 0
  vi.stubGlobal('Image', FakeImage)
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

async function load() {
  return (await import('./prefetchImage')).prefetchImage
}

describe('prefetchImage', () => {
  it('starts downloading the image', async () => {
    const prefetchImage = await load()
    prefetchImage('https://x/full.jpg')
    expect(created).toHaveLength(1)
    expect(created[0].src).toBe('https://x/full.jpg')
  })

  it('asks the same way the canvas does (anonymous CORS), so the browser reuses the cached copy', async () => {
    const prefetchImage = await load()
    prefetchImage('https://x/full.jpg')
    expect(created[0].crossOrigin).toBe('anonymous')
  })

  it('only requests each image once, however often the pointer passes over it', async () => {
    const prefetchImage = await load()
    prefetchImage('https://x/a.jpg')
    prefetchImage('https://x/a.jpg')
    prefetchImage('https://x/a.jpg')
    prefetchImage('https://x/b.jpg')
    expect(created.map((i) => i.src)).toEqual(['https://x/a.jpg', 'https://x/b.jpg'])
  })

  it.each([null, undefined, ''])('ignores a missing url (%j)', async (url) => {
    const prefetchImage = await load()
    prefetchImage(url)
    expect(created).toHaveLength(0)
  })
})
