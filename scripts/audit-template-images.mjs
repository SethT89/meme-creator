// Audits every template image in production and flags the ones worth optimizing.
//
//   node --env-file=.env.local scripts/audit-template-images.mjs
//
// The key number is BYTES PER PIXEL (file size / width x height): it says how hard an image is compressed
// regardless of its dimensions, so it finds files that are big because of how they were SAVED (a near-lossless
// export, an opaque PNG) rather than because they are large pictures. Read-only: it only lists the templates
// through the public API and asks storage for each file's size. See docs/image-optimization.md for what to do
// about a flagged image and why these thresholds.
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = process.env
if (!url || !key) throw new Error('Run with: node --env-file=.env.local scripts/audit-template-images.mjs')

// Thresholds, from the 2026-09-21 audit of the library (docs/image-optimization.md, "Baseline").
const MAX_BYTES_PER_PIXEL = 0.3 // healthy WebP/JPEG photos sat at 0.05-0.22 B/px
const MAX_KB = 250
const MAX_LONG_EDGE = 1200

const res = await fetch(`${url}/rest/v1/templates?select=name,image_width,image_height,blank_image_url&order=created_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
})
if (!res.ok) throw new Error(`Could not list templates: ${res.status}`)
const templates = await res.json()

const rows = []
for (const t of templates) {
  const head = await fetch(t.blank_image_url, { method: 'HEAD' })
  const bytes = Number(head.headers.get('content-length') ?? 0)
  const ext = t.blank_image_url.split('.').pop().toLowerCase()
  const pixels = t.image_width * t.image_height
  const flags = []
  if (bytes / pixels > MAX_BYTES_PER_PIXEL) flags.push('heavily-encoded')
  if (bytes / 1024 > MAX_KB) flags.push('big-file')
  if (Math.max(t.image_width, t.image_height) > MAX_LONG_EDGE) flags.push('large-dimensions')
  if (ext === 'png') flags.push('png (opaque? try WebP)')
  rows.push({ name: t.name, size: `${t.image_width}x${t.image_height}`, kb: Math.round(bytes / 1024), bpp: bytes / pixels, ext, flags })
}

rows.sort((a, b) => b.bpp - a.bpp)
console.log(`${'template'.padEnd(32)} ${'size'.padEnd(10)} ${'KB'.padStart(6)} ${'B/px'.padStart(7)}  fmt   flags`)
for (const r of rows) {
  console.log(`${r.name.slice(0, 31).padEnd(32)} ${r.size.padEnd(10)} ${String(r.kb).padStart(6)} ${r.bpp.toFixed(3).padStart(7)}  ${r.ext.padEnd(5)} ${r.flags.join(', ')}`)
}
const flagged = rows.filter((r) => r.flags.length)
const totalKb = rows.reduce((sum, r) => sum + r.kb, 0)
console.log(`\n${rows.length} templates, ${totalKb} KB of originals in total; ${flagged.length} flagged.`)
