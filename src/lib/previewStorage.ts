import { supabase } from './supabase'

const BUCKET = 'creation-previews'

// Everything here is best-effort by design: a creation's preview image is a
// convenience (gallery thumbnail, Download) and must never be the reason a
// Save or Delete fails.

// A creation's preview is re-rendered on every save. A fresh path each time
// (rather than overwriting a stable one) means the public URL changes too,
// so a browser or CDN can never keep serving the previous render.
export async function uploadPreview(blob: Blob | null | undefined): Promise<string | null> {
  if (!blob) return null
  try {
    const path = `${crypto.randomUUID()}.png`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' })
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
