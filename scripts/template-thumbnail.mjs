// Makes a small thumbnail for a template image and uploads it next to the original.
//
//   node --env-file=.env.local scripts/template-thumbnail.mjs random/my-image.jpg [more paths...]
//
// Each argument is the image's path INSIDE the `template-images` bucket, i.e.
// what follows `/template-images/` in its blank_image_url. The original must
// already be uploaded. The thumbnail lands at `thumbs/<same path>.jpg` (so
// `random/a.webp` -> `thumbs/random/a.jpg`), at most 160px on its longest side
// (about 3x the 56px sidebar card, sharp on retina), as a JPEG. Re-running
// replaces an existing thumbnail.
//
// The sidebar loads every template's thumbnail at once, so keeping each one to a
// few KB (rather than the full ~160 KB+ image) is what holds down Supabase egress
// as the library grows. After running this, set the row's `thumbnail_url` to the
// URL it prints (see the seed migrations for the pattern).
//
// Needs macOS (uses the built-in `sips` to resize and to read webp/png/jpg).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'template-images'
const MAX_EDGE = 160
const JPEG_QUALITY = 70

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = process.env
if (!url || !key) throw new Error('Run with: node --env-file=.env.local scripts/template-thumbnail.mjs <path>...')
const paths = process.argv.slice(2)
if (paths.length === 0) throw new Error('Give at least one storage path, e.g. random/my-image.jpg')

const supabase = createClient(url, key)
const workDir = mkdtempSync(path.join(tmpdir(), 'thumb-'))

try {
  for (const original of paths) {
    const response = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${original}`)
    if (!response.ok) throw new Error(`${original}: could not download the original (${response.status}) — is it uploaded?`)
    const source = path.join(workDir, `source${path.extname(original)}`)
    const output = path.join(workDir, 'thumb.jpg')
    writeFileSync(source, Buffer.from(await response.arrayBuffer()))

    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), '-Z', String(MAX_EDGE), source, '--out', output], {
      stdio: 'ignore',
    })
    const bytes = readFileSync(output)

    const target = `thumbs/${original.replace(/\.[^./]+$/, '')}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(target, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '86400' })
    if (error) throw new Error(`${original}: upload failed: ${error.message}`)

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(target).data.publicUrl
    console.log(`${original}: ${(response.headers.get('content-length') ?? '?')} B -> ${bytes.length} B  ${publicUrl}`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
