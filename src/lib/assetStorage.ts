import { supabase } from './supabase'

// Images a user uploads onto a canvas are stored in this bucket the moment
// they're added (see EditorPage's upload handler), and each image layer's
// `src` in a creation's canvas_data is that file's public URL.
const BUCKET = 'creation-assets'

// The row only stores the public URL, so recover the object path from it.
// Null for anything that isn't a file in this bucket (a local blob: preview
// of an upload still in flight, a template image, junk).
export function assetPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// Every uploaded file a creation's image layers point at, each listed once.
// Takes untyped JSON because that's what the column holds.
export function assetPathsFromCanvasData(canvasData: unknown): string[] {
  const layers = (canvasData as { layers?: unknown } | null | undefined)?.layers
  if (!Array.isArray(layers)) return []
  const paths = new Set<string>()
  for (const layer of layers) {
    if (layer?.type !== 'image') continue
    const path = assetPathFromUrl(typeof layer.src === 'string' ? layer.src : null)
    if (path) paths.add(path)
  }
  return [...paths]
}

// Called after a creation has been deleted, with its canvas_data: deletes the
// uploaded images it used, except any that another creation still uses. (Save
// As copies a creation's layers, so two creations can point at the very same
// uploaded file — deleting one must not break the other.)
//
// Best-effort by design, like removePreview: a leftover file is harmless, but a
// failed delete must never surface as an error, and — more importantly — if we
// can't tell what's still in use we delete NOTHING, because removing a file
// someone's saved meme still shows would be unrecoverable.
//
// The "still in use" check reads every creation this user can see. That's right
// while a user's uploads are only ever shared between their own Save As copies;
// if creations ever become shareable across users, this needs a server-side
// reference count instead.
export async function removeUnusedAssets(deletedCanvasData: unknown): Promise<void> {
  const candidates = assetPathsFromCanvasData(deletedCanvasData)
  if (candidates.length === 0) return
  try {
    const { data, error } = await supabase.from('creations').select('canvas_data')
    if (error || !data) return
    const inUse = new Set(data.flatMap((row) => assetPathsFromCanvasData(row.canvas_data)))
    const unused = candidates.filter((path) => !inUse.has(path))
    if (unused.length === 0) return
    await supabase.storage.from(BUCKET).remove(unused)
  } catch {
    // see above: an orphaned file is harmless
  }
}
