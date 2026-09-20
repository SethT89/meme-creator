import { getCurrentUserId } from './currentUser'
import type { Layer } from './layers'

// The editor's unsaved work, kept in the browser so leaving the screen (My Saves and
// back, a refresh, a closed tab) doesn't lose it. Exactly ONE draft per user: the
// editor's current contents, whether new work or unsaved edits to a saved meme.
//
// Local (localStorage), not server-side: with no logins yet, cross-device drafts buy
// nothing, and a local one needs no expiry job, leaves no orphaned uploads and doesn't
// clutter My Saves. Images are already public Supabase URLs, so a draft is a few KB.

export type EditorSource =
  | { type: 'freeform'; name: string; canvasWidth?: number; canvasHeight?: number }
  // A template's canvas starts as exactly its image. Once adjusted, canvasWidth/
  // canvasHeight are the canvas's own size and backgroundX/Y is where the template
  // image sits inside it (all four undefined until then).
  | {
      type: 'template'
      name: string
      templateId: string
      blankImageUrl: string
      // Small thumbnail shown behind the full image until it has loaded.
      thumbnailUrl?: string | null
      canvasWidth?: number
      canvasHeight?: number
      backgroundX?: number
      backgroundY?: number
    }

export interface DraftSavedMeta {
  id: string
  name: string
  tags: string[]
}

export interface EditorDraft {
  version: 1
  // When it was last written (ms since epoch) — what the 30-day expiry counts from.
  savedAt: number
  // Whether it differs from its pristine state. A picked-but-untouched template is kept
  // (it's "something in the editor") but has nothing worth warning someone about losing.
  hasEdits: boolean
  source: EditorSource
  savedMeta: DraftSavedMeta | null
  layers: Layer[]
  // The editor's own "pristine" snapshot (fresh template defaults, or the saved meme as
  // last saved) and canvas-adjusted flag: kept so a restored draft behaves exactly as it
  // did, including which actions warn about losing work.
  baseline: Layer[]
  canvasEdited: boolean
}

const DRAFT_VERSION = 1
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function draftStorageKey(userId: string = getCurrentUserId()): string {
  return `meme-creator:draft:v${DRAFT_VERSION}:${userId}`
}

// An image still uploading has a temporary blob: URL that is meaningless after the page
// is gone — restoring it would show a broken image, so it isn't kept.
export function withoutInFlightImages(layers: Layer[]): Layer[] {
  return layers.filter((layer) => !(layer.type === 'image' && layer.src.startsWith('blob:')))
}

// Storage can be unavailable (some private modes) or full: none of it may break editing.
export function writeDraft(draft: Omit<EditorDraft, 'version' | 'savedAt'>, now: number = Date.now()): void {
  try {
    const stored: EditorDraft = {
      version: DRAFT_VERSION,
      savedAt: now,
      ...draft,
      layers: withoutInFlightImages(draft.layers),
      baseline: withoutInFlightImages(draft.baseline),
    }
    localStorage.setItem(draftStorageKey(), JSON.stringify(stored))
  } catch {
    // no storage: the editor just works without a draft
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(draftStorageKey())
  } catch {
    // see writeDraft
  }
}

function isValid(value: unknown): value is EditorDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<EditorDraft> & { source?: { type?: unknown } }
  return (
    draft.version === DRAFT_VERSION &&
    typeof draft.savedAt === 'number' &&
    typeof draft.source === 'object' &&
    draft.source !== null &&
    (draft.source.type === 'template' || draft.source.type === 'freeform') &&
    Array.isArray(draft.layers) &&
    Array.isArray(draft.baseline)
  )
}

// A draft that is unreadable, from another version, or older than 30 days is treated as
// absent AND removed, so it isn't re-parsed (or resurrected) on every visit.
export function readDraft(now: number = Date.now()): EditorDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey())
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    if (!isValid(parsed) || now - parsed.savedAt > DRAFT_TTL_MS) {
      clearDraft()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// Which draft an editor route may restore. The plain editor (`/`) restores whatever the
// draft is — new work, or unsaved edits to a saved meme. A saved meme's own route
// (`/editor/:id`) only restores a draft OF that meme; for any other draft it loads the
// saved meme normally (a warning about discarding the draft came earlier, on My Saves).
export function draftBelongsTo(draft: EditorDraft, creationId: string | undefined): boolean {
  return creationId === undefined ? true : draft.savedMeta?.id === creationId
}
