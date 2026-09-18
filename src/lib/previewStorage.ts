import { supabase } from './supabase'

const BUCKET = 'creation-previews'

// How a creation is rendered for its preview: a downscaled JPEG, not the
// full-size PNG that Export produces. Uploading the PNG of a big photo took
// ~15s (8 MB); this is ~100-300 KB, and plenty for a card thumbnail.
export const PREVIEW_RENDER_OPTIONS = { maxEdge: 1200, type: 'image/jpeg', quality: 0.85 } as const

// Everything here is best-effort by design: a creation's preview image is a
// convenience (gallery thumbnail, Download) and must never be the reason a
// Save or Delete fails.

// A creation's preview is re-rendered on every save. A fresh path each time
// (rather than overwriting a stable one) means the public URL changes too,
// so a browser or CDN can never keep serving the previous render.
export async function uploadPreview(blob: Blob | null | undefined): Promise<string | null> {
  if (!blob) return null
  try {
    const contentType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const path = `${crypto.randomUUID()}.${contentType === 'image/jpeg' ? 'jpg' : 'png'}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType })
    if (error) return null
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

// The row only stores the public URL, so recover the object path from it.
export function previewPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// Cleans up a preview that has been replaced or whose creation was deleted.
export async function removePreview(url: string | null | undefined): Promise<void> {
  const path = previewPathFromUrl(url)
  if (!path) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    // an orphaned file is harmless
  }
}
