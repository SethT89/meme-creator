import { describe, it, expect, vi, afterEach } from 'vitest'
import { sanitizeFilename, canShareFile, shareFile, downloadBlob, isMobileOrTabletDevice } from './exportDelivery'

function mockUserAgent(userAgent: string, maxTouchPoints: number) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
}

describe('sanitizeFilename', () => {
  it('replaces runs of non-alphanumeric characters with a single dash', () => {
    expect(sanitizeFilename('Two Buttons 1')).toBe('Two-Buttons-1')
  })

  it('strips leading/trailing dashes left over from punctuation at the edges', () => {
    expect(sanitizeFilename('  !!Drake??  ')).toBe('Drake')
  })

  it('falls back to "meme" for a name that sanitizes to nothing', () => {
    expect(sanitizeFilename('???')).toBe('meme')
  })
})

describe('canShareFile', () => {
  afterEach(() => {
    // @ts-expect-error test-only cleanup of a property this suite defines
    delete navigator.canShare
  })

  it('returns true when navigator.canShare exists and approves the file', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    expect(canShareFile(file)).toBe(true)
  })

  it('returns false when navigator.canShare is not a function (unsupported browser)', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    expect(canShareFile(file)).toBe(false)
  })

  it('returns false when navigator.canShare exists but rejects the file', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    expect(canShareFile(file)).toBe(false)
  })
})

describe('isMobileOrTabletDevice', () => {
  const originalUserAgent = navigator.userAgent
  const originalMaxTouchPoints = navigator.maxTouchPoints

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true })
  })

  it('returns false for a real Mac desktop (Macintosh UA, no touch points)', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      0,
    )
    expect(isMobileOrTabletDevice()).toBe(false)
  })

  it('returns false for a touchscreen Windows laptop — still a desktop OS, no Files-app confusion', () => {
    mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0', 10)
    expect(isMobileOrTabletDevice()).toBe(false)
  })

  it('returns true for an iPhone', () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 5)
    expect(isMobileOrTabletDevice()).toBe(true)
  })

  it('returns true for an Android phone', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 5)
    expect(isMobileOrTabletDevice()).toBe(true)
  })

  it('returns true for an iPad in its default desktop-UA mode (Macintosh UA + touch points)', () => {
    // iPadOS reports itself as desktop "Macintosh" by default — the only
    // reliable tell is that a real Mac never has touch points.
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      5,
    )
    expect(isMobileOrTabletDevice()).toBe(true)
  })
})

describe('shareFile', () => {
  afterEach(() => {
    // @ts-expect-error test-only cleanup of a property this suite defines
    delete navigator.share
  })

  it('calls navigator.share with the file and title', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    await shareFile(file, 'a.png')

    expect(share).toHaveBeenCalledWith({ files: [file], title: 'a.png' })
  })
})

describe('downloadBlob', () => {
  it('creates an object URL, clicks a download link, then revokes the URL', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = new Blob(['x'], { type: 'image/png' })
    downloadBlob(blob, 'meme.png')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')

    clickSpy.mockRestore()
    vi.useRealTimers()
  })
})
