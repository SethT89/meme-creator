import { describe, it, expect, vi, afterEach } from 'vitest'
import { DRAFT_TTL_MS, clearDraft, draftBelongsTo, draftStorageKey, readDraft, withoutInFlightImages, writeDraft } from './editorDraft'
import type { EditorDraft, EditorSource } from './editorDraft'
import { CURRENT_USER_ID } from './currentUser'
import type { Layer } from './layers'

const text = (id: string, label = 'hi'): Layer => ({ type: 'text', id, label, x: 1, y: 2, width: 100, height: 40, fontSize: 30, heightAuto: true, fontFamily: 'anton' })
const image = (id: string, src: string): Layer => ({ type: 'image', id, src, naturalWidth: 400, naturalHeight: 300, x: 0, y: 0, width: 400, height: 300 })
const template: EditorSource = { type: 'template', name: 'Two Buttons', templateId: 't1', blankImageUrl: 'https://x/blank.jpg', thumbnailUrl: 'https://x/thumb.jpg' }

const input = (over: Partial<Omit<EditorDraft, 'version' | 'savedAt'>> = {}) => ({
  hasEdits: true,
  source: template,
  savedMeta: null,
  layers: [text('a', 'Edited')],
  baseline: [text('a', 'Caption 1')],
  canvasEdited: false,
  ...over,
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('writeDraft / readDraft', () => {
  it('returns exactly what was written, stamped with a version and the time', () => {
    writeDraft(input(), 1000)
    expect(readDraft(1000)).toEqual({ version: 1, savedAt: 1000, ...input() })
  })

  it('returns null when there is no draft', () => {
    expect(readDraft()).toBeNull()
  })

  it('keeps only the latest: there is one draft, and writing replaces it', () => {
    writeDraft(input({ layers: [text('a', 'first')] }))
    writeDraft(input({ layers: [text('a', 'second')] }))
    expect((readDraft()!.layers[0] as { label: string }).label).toBe('second')
  })

  it('remembers a draft of a saved meme, including which one', () => {
    writeDraft(input({ savedMeta: { id: 'c9', name: 'Old Meme', tags: ['funny'] } }))
    expect(readDraft()!.savedMeta).toEqual({ id: 'c9', name: 'Old Meme', tags: ['funny'] })
  })
})

describe('per user', () => {
  it('stores the draft under a key that names the user, so drafts never mix between accounts on one browser', () => {
    writeDraft(input())
    expect(localStorage.getItem(draftStorageKey())).not.toBeNull()
    expect(draftStorageKey()).toContain(CURRENT_USER_ID)
    expect(draftStorageKey('someone-else')).not.toBe(draftStorageKey())
  })

  it("does not read another user's draft", () => {
    writeDraft(input())
    // move it under another user's key, as if a different person had written it
    const raw = localStorage.getItem(draftStorageKey())!
    localStorage.clear()
    localStorage.setItem(draftStorageKey('someone-else'), raw)
    expect(readDraft()).toBeNull()
  })
})

describe('expiry', () => {
  it('still returns a draft that is just under 30 days old', () => {
    writeDraft(input(), 0)
    expect(readDraft(DRAFT_TTL_MS - 1)).not.toBeNull()
  })

  it('ignores and removes a draft older than 30 days', () => {
    writeDraft(input(), 0)
    expect(readDraft(DRAFT_TTL_MS + 1)).toBeNull()
    expect(localStorage.getItem(draftStorageKey())).toBeNull()
  })

  it('is 30 days', () => {
    expect(DRAFT_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('damaged or unknown data', () => {
  const put = (value: unknown) => localStorage.setItem(draftStorageKey(), typeof value === 'string' ? value : JSON.stringify(value))

  it.each([
    ['not JSON', 'not json {'],
    ['a different version', { version: 99, savedAt: Date.now(), source: template, layers: [], baseline: [] }],
    ['no source', { version: 1, savedAt: Date.now(), layers: [], baseline: [] }],
    ['an unknown kind of source', { version: 1, savedAt: Date.now(), source: { type: 'mystery' }, layers: [], baseline: [] }],
    ['layers that are not a list', { version: 1, savedAt: Date.now(), source: template, layers: 'no', baseline: [] }],
    ['no baseline', { version: 1, savedAt: Date.now(), source: template, layers: [] }],
    ['no timestamp', { version: 1, source: template, layers: [], baseline: [] }],
    ['null', 'null'],
  ])('ignores a draft with %s, and removes it so it is not re-read forever', (_name, value) => {
    put(value)
    expect(readDraft()).toBeNull()
    expect(localStorage.getItem(draftStorageKey())).toBeNull()
  })
})

describe('uploads still in flight', () => {
  it('drops image layers whose file is still a temporary blob: link, which dies with the page', () => {
    const layers = [text('a'), image('i1', 'blob:http://localhost/123'), image('i2', 'https://x/creation-assets/up.jpg')]
    expect(withoutInFlightImages(layers).map((l) => l.id)).toEqual(['a', 'i2'])
  })

  it('applies that to both the layers and the baseline when writing', () => {
    writeDraft(input({ layers: [text('a'), image('i1', 'blob:http://localhost/1')], baseline: [image('i1', 'blob:http://localhost/1')] }))
    const draft = readDraft()!
    expect(draft.layers.map((l) => l.id)).toEqual(['a'])
    expect(draft.baseline).toEqual([])
  })
})

describe('clearDraft', () => {
  it('removes the draft', () => {
    writeDraft(input())
    clearDraft()
    expect(readDraft()).toBeNull()
  })

  it('is harmless when there is nothing to clear', () => {
    expect(() => clearDraft()).not.toThrow()
  })
})

describe('when the browser blocks storage (some private modes, full disk)', () => {
  it('writing quietly does nothing instead of breaking the editor', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeDraft(input())).not.toThrow()
  })

  it('reading and clearing quietly find nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readDraft()).toBeNull()
    expect(() => clearDraft()).not.toThrow()
  })
})

describe('draftBelongsTo (which draft an editor route may restore)', () => {
  const draft = (savedMetaId: string | null): EditorDraft => ({
    version: 1,
    savedAt: 1,
    ...input({ savedMeta: savedMetaId ? { id: savedMetaId, name: 'n', tags: [] } : null }),
  })

  it('on the plain editor route, any draft can be restored — new work or edits to a saved meme', () => {
    expect(draftBelongsTo(draft(null), undefined)).toBe(true)
    expect(draftBelongsTo(draft('c9'), undefined)).toBe(true)
  })

  it('on a saved meme\'s own route, only a draft of that very meme', () => {
    expect(draftBelongsTo(draft('c9'), 'c9')).toBe(true)
    expect(draftBelongsTo(draft('c1'), 'c9')).toBe(false)
    expect(draftBelongsTo(draft(null), 'c9')).toBe(false)
  })
})
