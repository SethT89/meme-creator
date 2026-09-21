# Image optimization guide

How to decide whether an image needs optimizing, what to change, and how to check the result. Written for the
templates we seed by hand today, and for the user-uploaded images we plan to allow later. Numbers in here were
**measured** on our own images (2026-09-21) unless a line says *unverified*.

## The short version

1. **Measure bytes per pixel, not just file size.** A large file is usually large because of *how it was saved*, not
   because the picture is big. Healthy photos in our library sit at **0.05–0.22 bytes per pixel (B/px)**. Anything
   above **0.3** is worth a look.
2. **Re-encode before you resize.** Our two worst files (737 KB and 668 KB) shrank by **83%** and **93%** with the
   *same pixel dimensions* and no visible change. Shrinking dimensions is the second lever, not the first.
3. **Default to WebP at quality 85** (90 for text, screenshots and hard edges). JPEG where WebP can't be produced (see
   "Uploads"). PNG only for real transparency or flat graphics.
4. **Never upscale, and never re-compress an already-lossy JPEG for a small win.**
5. **Keep the original.** Upload a derivative. The database's `image_width`/`image_height` must always equal the real
   pixel size of the file that was uploaded.
6. **Look at it.** Compare the most detailed area at 3× zoom, side by side, before accepting a smaller file.

Run `node --env-file=.env.local scripts/audit-template-images.mjs` to see where every template stands.

---

## How images move through the app

| Image | Comes from | Processing today | Downloaded when | What drives its size |
|---|---|---|---|---|
| **Template image** | Hand-seeded from `Images/` into the `template-images` bucket | Whatever we upload (this guide) | The **full image on every pick**; the list only loads the thumbnail | Our encoding choices |
| **Template thumbnail** | `scripts/template-thumbnail.mjs` | 160 px longest side, JPEG q70 (~5–10 KB) | Every visit, for every template | Fixed |
| **Uploaded photo layer** | The user, in the editor | `prepareImageForUpload` in the browser: downscale to at most **2400 px** longest side, re-encode as **JPEG q85** → `creation-assets` bucket | On every Save (the preview render re-downloads each image layer), every Export, and every time the meme is opened | The user's photo, capped at 2400 px |
| **Saved-meme preview** | Rendered in the browser at Save | At most 1200 px longest side, JPEG q85 → `creation-previews` | Gallery cards (Download now re-renders a lossless PNG instead) | Fixed |

Two facts that shape every decision:

- **Export and Download render at the image's real pixel size.** A template that is 700 px wide exports 700 px wide.
  Its dimensions *are* the export resolution.
- **The on-screen canvas is only ~300–650 CSS px wide**, so a 1000–1200 px image already covers a phone at 3× pixel
  density. Going much beyond that buys sharpness nobody sees, at a real bandwidth cost.

Bandwidth is the pressure point: Supabase's free tier caps egress, and every template pick downloads its full image.

---

## The metric: bytes per pixel

`B/px = file size in bytes ÷ (width × height)`. It says how hard an image is compressed, independent of its
dimensions, so it separates "big because it's a large picture" from "big because it was saved wastefully".

### Baseline: the library on 2026-09-21

| Template | Pixels | Before | B/px | After | B/px | What was wrong |
|---|---|---|---|---|---|---|
| Hulk Always Angry | 500×881 | **668 KB** PNG | 1.55 | **44 KB** WebP q90 | 0.10 | A fully **opaque** image saved as PNG with an unused alpha channel |
| Magnificent Monster | 1000×652 | **737 KB** WebP | 1.16 | **129 KB** WebP q85 | 0.20 | A near-lossless export, ~10× denser than everything else |
| Horse-Drawn Car | 1000×667 | 343 KB JPEG | 0.53 | *not changed* | 0.53 | Heavily encoded, but already lossy (see "Judgment calls") |
| The other 19 | | 20–117 KB each | 0.05–0.22 | | | Healthy |

The whole library went from about **2.8 MB to 1.6 MB** of originals (−44%) from two files.

**Thresholds** (also what the audit script flags): more than **0.3 B/px**, more than **250 KB**, more than **1200 px**
on the long edge, or a **PNG**.

---

## Decision procedure

Work through these in order for any new or suspect image.

**1. Read the real pixel size.** `sips -g pixelWidth -g pixelHeight <file>` (macOS). Never trust a guess or a browser
measurement; the database needs the true numbers.

**2. Compute B/px.** File size ÷ (width × height). Under 0.3 and under 250 KB → probably fine; go to step 8 only if
you're adding it as a new template.

**3. Check transparency.** Does the image *use* its alpha channel? A PNG that says RGBA is often fully opaque (Hulk
was). If nothing is transparent, drop the channel: that alone made Hulk 15× smaller. If transparency is real, keep
an alpha-capable format (WebP with alpha, or PNG) and see "Uploads → Transparency".

**4. Pick the format** (table below).

**5. Decide dimensions** (table below). Only downsample if the long edge is over the target. Never upscale.

**6. Pick a quality** (table below).

**7. Encode** (snippet at the end).

**8. Verify.** Target size reached, and compare the most detailed region at 3× zoom, original next to result. Look
especially at text, faces and hard edges. If you can see a difference, raise the quality one step.

**9. Upload.**
- Same format and path → overwrite in place with an upsert (`scripts/template-thumbnail.mjs` shows the call). The URL
  doesn't change, and storage serves these files with `Cache-Control: no-cache`, so browsers revalidate rather than
  serve a stale copy.
- New format or path → upload the new file, then point the template row's `blank_image_url` and `example_image_url`
  at it. **Leave the old file for now**: a restored editor draft can still hold the old URL.

**10. Fix the database.** If the pixel dimensions changed, update `image_width`/`image_height`. Regenerate the
thumbnail only if the *picture* changed, not for a plain re-encode.

**11. Keep the original.** The optimized file is a derivative; the original stays in `Images/`.

---

## Format guide

| Format | Use it for | Notes |
|---|---|---|
| **WebP** (lossy) | **Default for photos, paintings, screenshots** | All current browsers decode it. Verified live: picking it, drawing it to canvas and exporting all work exactly like a JPEG. |
| **JPEG** | The in-browser upload path (see below); anything that must work everywhere | Universal to *produce* from a canvas. Cannot hold transparency. |
| **PNG** | Real transparency, or flat graphics with few colors | For a photo or a movie still it is 10–20× larger than WebP. Hulk: 668 KB → 44 KB. |
| **GIF / animated WebP** | Nothing | Our upload path draws the image onto a canvas, which takes only the **first frame**, so an animation becomes a still (exports do the same). |
| **HEIC/HEIF** | Nothing (convert first) | iPhone originals. Most browsers can't decode them. *Unverified* per browser. |
| **AVIF** | Not yet | Compresses better, but encoding support in browsers is uneven and slower. Revisit later. |

**Tooling on our machines:** macOS `sips` can read WebP and resize/convert to JPEG/PNG, but it **cannot write WebP**
(tested). There is no `cwebp`/ImageMagick/ffmpeg installed. Python **Pillow** (`pip3 install pillow`) can, and is what
the snippet below uses. It is not a project dependency, and shouldn't need to be for one-off template work.

---

## Dimensions: when to downsample

| Purpose | Long-edge target | Notes |
|---|---|---|
| **Template image** | **700–1200 px** | Most of our library is 700 wide and looks fine. Use up to ~1200 only when the picture has small details that matter (the monster painting has tiny figures). |
| **Thumbnail** | 160 px | Fixed by the script. |
| **Uploaded photo layer** | Currently 2400 px | See "Uploads → the cap": probably worth lowering. |
| **Preview** | 1200 px | Fixed in code (`PREVIEW_RENDER_OPTIONS`). |

Rules:

- **Resize first only if the image exceeds its target.** Otherwise leave the pixels alone and re-encode.
- **Don't cut dimensions and quality hard at once.** Pick the lever that matters: if the size problem is B/px, fix the
  encoding; if the picture is simply larger than the target, downsample and keep quality at 80+.
- **Use Lanczos resampling**, keep the aspect ratio, and convert to sRGB.
- **Why not go smaller than needed?** Export resolution equals the image's pixels. Social apps recompress and cap
  dimensions on their own (Instagram's feed width is commonly cited around 1080 px; *check current limits before
  relying on any number*), so extra pixels are wasted, but too few makes the shared meme soft.

---

## Quality: what we measured

PSNR is a similarity score in dB (higher is closer; roughly 40+ is very hard to tell from the original, mid-30s
is fine for photos). All rows are WebP re-encodes of our own files.

| Image | Setting | Size | Result |
|---|---|---|---|
| Magnificent Monster (737 KB) | q90 | 175 KB | 40.0 dB |
| | **q85** | **129 KB** | **37.8 dB, indistinguishable at 3× zoom** |
| | q80 | 100 KB | 36.0 dB |
| | q75 | 76 KB | Edges visibly soften at 3× zoom |
| Hulk (668 KB opaque PNG) | **q90** | **44 KB** | **43.0 dB** |
| | q85 | 32 KB | 41.3 dB |
| Horse-Drawn Car (343 KB, already a JPEG) | q85 | 169 KB (−51%) | 35.2 dB, lowest of the set |

**Rules of thumb:**
- **q85** for photos and paintings.
- **q90** for anything with text, hard edges, comic panels or screenshots.
- **q70** only for 160 px thumbnails.
- Going below ~q80 on a large image is where softness starts to show.

---

## Judgment calls

**Horse-Drawn Car (343 KB, 0.53 B/px).** The audit flags it, but it is *already a lossy JPEG*. Re-encoding it saves
about half (169 KB) yet measures the lowest quality of anything we tested (35.2 dB), because compressing twice stacks
the losses. Options: leave it (recommended until bandwidth matters), re-encode at q90 (211 KB, −39%), or find a
better source. **Rule:** don't re-compress an already-lossy file unless the saving is large or the source is
unavailable.

---

## Uploads (planned)

Today `prepareImageForUpload` (in `src/lib/imageUpload.ts`) runs in the browser: it draws the picked file to a canvas
(at most 2400 px on the long edge) and uploads a JPEG at q85. That is a sound base, with these things to settle
before real users upload:

**Transparency.** *Verified 2026-09-21:* a transparent PNG goes in, and the transparent areas come out **solid black**
(the JPEG has no alpha and canvas fills it with black). This will break stickers and cut-outs. Decide a policy first:
composite onto a chosen background, or use an alpha-capable format for those images.

**Animated GIFs / WebPs.** The upload path draws the file onto a canvas, which keeps only the first frame, so an
animation is saved as a still. Either reject them with a clear message or accept that they become stills.

**HEIC.** Most browsers can't decode iPhone originals. Reject with a clear message or convert. *Unverified* on Safari
vs Chrome; test on a real device.

**Very large photos (48 MP phones).** iOS Safari has historically limited canvas size (roughly 16.7 megapixels), so a
huge photo can fail or come out blank when drawn whole. *Unverified here.* Test with a real 48 MP photo; the
mitigation is to downscale in steps or decode straight to a smaller size with `createImageBitmap`.

**Rotation and metadata.** Modern browsers should apply EXIF orientation when drawing; re-encoding through a canvas
also drops EXIF metadata including GPS location, which is a privacy plus. Both *unverified*: test with a rotated
portrait photo and a geotagged photo before relying on either.

**Color.** Wide-gamut (Display P3) photos become sRGB through the canvas and may look slightly duller. Acceptable.

**The 2400 px cap.** The one real upload we have is 354×498 at 50 KB (0.28 B/px). At that density a 2400×1800 photo is
roughly **1.2 MB** (an estimate), and it is re-downloaded on every Save preview and every Export. A cap of **1600–2000 px** would
cut that by 30–55% while still giving a sharp export. Decide with data: log the upload size and dimensions for the
first weeks and look at the median.

**Validation is client-side only.** Storage access rules are still "v1 open", and a client check can be bypassed. Before
public uploads: set a file-size limit and allowed types on the bucket, and add moderation. (Orphaned-file cleanup is a
separate, already-designed piece of work.)

**Should the server re-encode?** Not yet. If uploads grow, an Edge Function that re-encodes every upload to a known
format and size would remove the reliance on the client, at the cost of running (and paying for) that function.

---

## Encode snippet (Pillow)

```python
from PIL import Image

src = 'Images/Random_Images/original.png'
dst = 'optimized.webp'

im = Image.open(src).convert('RGB')          # drops an unused alpha channel
# Optional, only if the long edge exceeds the target:
# im.thumbnail((1200, 1200), Image.LANCZOS)  # never enlarges, keeps aspect ratio
im.save(dst, 'WEBP', quality=85, method=6)   # 90 for text / hard edges
print(im.size)                                # goes into image_width / image_height if it changed
```

Check the result numerically (mean absolute error and PSNR against the original):

```python
import io, numpy as np
from PIL import Image
o = Image.open(src).convert('RGB')
b = io.BytesIO(); o.save(b, 'WEBP', quality=85, method=6); b.seek(0)
e = np.asarray(Image.open(b).convert('RGB')).astype(float) - np.asarray(o).astype(float)
print('PSNR %.1f dB' % (10 * np.log10(255**2 / (e**2).mean())))
```

---

## Routine

- **Adding a template:** after uploading, run the audit script. A new template that isn't flagged is done.
- **Periodically** (and before launch): run the audit and work through anything flagged with the procedure above.
- **When uploads launch:** revisit the "Uploads" section and settle its open decisions.

## Open decisions

- Horse-Drawn Car: leave, re-encode at q90, or replace the source?
- The upload cap: keep 2400 px, or lower to 1600–2000 px?
- Transparency policy for stickers and cut-outs.
- Reject or convert HEIC and animated files.
- Move to server-side re-encoding once uploads are public?
