import { describe, it, expect, vi, afterEach } from 'vitest'
import { sanitizeFilename, canShareFile, shareFile, downloadBlob } from './exportDelivery'

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
