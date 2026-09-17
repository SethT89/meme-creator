# Canvas Export (Download / Share) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Editor's "Export" button render the current template-based creation to a full-resolution PNG and deliver it — as a browser download on desktop, or via the native OS share sheet on mobile.

**Architecture:** A pure rendering module (`src/lib/exportCanvas.ts`) draws the template image + text layers onto an off-screen `<canvas>` at the template's real pixel resolution and returns a PNG `Blob`. A pure delivery module (`src/lib/exportDelivery.ts`) handles filename sanitization and the desktop-download vs. mobile-share branching. `EditorPage.tsx` wires these together behind the Export button: a loading spinner while working, and a toast on completion.

**Tech Stack:** React 19 + TypeScript, native Canvas 2D API (no new dependency), Web Share API (feature-detected), Vitest + Testing Library.

**Design doc:** `docs/superpowers/specs/2026-09-17-canvas-export-design.md` — read this first for the full rationale (why canvas over html2canvas, why local-only, what's out of scope).

---

### Task 1: `sanitizeFilename`

**Files:**
- Create: `src/lib/exportDelivery.ts`
- Test: `src/lib/exportDelivery.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/exportDelivery.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeFilename } from './exportDelivery'

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/exportDelivery.test.ts`
Expected: FAIL — `exportDelivery.ts` does not exist / `sanitizeFilename` is not exported.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/lib/exportDelivery.ts
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'meme'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/exportDelivery.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportDelivery.ts src/lib/exportDelivery.test.ts
git commit -m "feat: add sanitizeFilename for export filenames"
```

---

### Task 2: `canShareFile`, `shareFile`, `downloadBlob`

**Files:**
- Modify: `src/lib/exportDelivery.ts`
- Modify: `src/lib/exportDelivery.test.ts`

These are the two delivery mechanisms: the Web Share API path (mobile) and the anchor-click download path (desktop). `canShareFile` is a pure feature-detection wrapper; `shareFile` and `downloadBlob` are thin wrappers around browser APIs, each mockable in tests via `Object.defineProperty`/`vi.spyOn` rather than relying on jsdom to actually implement them (it doesn't implement `navigator.share` or `URL.createObjectURL`).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/exportDelivery.test.ts`:

```typescript
import { vi, afterEach } from 'vitest'
import { canShareFile, shareFile, downloadBlob } from './exportDelivery'

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/exportDelivery.test.ts`
Expected: FAIL — `canShareFile`, `shareFile`, `downloadBlob` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/exportDelivery.ts`:

```typescript
export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

export async function shareFile(file: File, title: string): Promise<void> {
  await navigator.share({ files: [file], title })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick, not synchronously — revoking immediately can
  // cancel a same-tick download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/exportDelivery.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportDelivery.ts src/lib/exportDelivery.test.ts
git commit -m "feat: add share/download delivery helpers for export"
```

---

### Task 3: `wrapTextLines`

**Files:**
- Create: `src/lib/exportCanvas.ts`
- Test: `src/lib/exportCanvas.test.ts`

Canvas has no built-in word-wrap. This is a small greedy line-breaker: add a word to the current line unless it would exceed `maxWidth`, in which case start a new line. Tested with a fake `measureText` (10px per character) so results are deterministic without real font metrics.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/exportCanvas.test.ts
import { describe, it, expect } from 'vitest'
import { wrapTextLines } from './exportCanvas'

// Fixed 10px-per-character stub — real font metrics aren't available in
// jsdom, and this keeps assertions simple and deterministic.
const fakeCtx = { measureText: (text: string) => ({ width: text.length * 10 }) }

describe('wrapTextLines', () => {
  it('returns an empty array for blank text', () => {
    expect(wrapTextLines(fakeCtx, '', 1000)).toEqual([])
    expect(wrapTextLines(fakeCtx, '   ', 1000)).toEqual([])
  })

  it('keeps everything on one line when it fits', () => {
    expect(wrapTextLines(fakeCtx, 'a b c', 1000)).toEqual(['a b c'])
  })

  it('breaks onto a new line once adding a word would exceed maxWidth', () => {
    // 'aaaaaaaaaa' is 100px. Adding ' bbbbbbbbbb' makes the line 210px,
    // over a 150px maxWidth, so it wraps onto its own line instead.
    expect(wrapTextLines(fakeCtx, 'aaaaaaaaaa bbbbbbbbbb', 150)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb'])
  })

  it('puts an unbreakably long single word on its own line rather than dropping it', () => {
    expect(wrapTextLines(fakeCtx, 'supercalifragilistic', 50)).toEqual(['supercalifragilistic'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: FAIL — `exportCanvas.ts` does not exist / `wrapTextLines` is not exported.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/lib/exportCanvas.ts

// Canvas has no built-in word-wrap — greedily fills each line up to
// maxWidth, approximating (not guaranteeing pixel-identical to) the
// browser's own text wrapping in the live DOM editor.
export function wrapTextLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let currentLine = words[0]

  for (const word of words.slice(1)) {
    const testLine = `${currentLine} ${word}`
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  lines.push(currentLine)
  return lines
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportCanvas.ts src/lib/exportCanvas.test.ts
git commit -m "feat: add wrapTextLines for canvas export text wrapping"
```

---

### Task 4: `renderCreationToBlob`

**Files:**
- Modify: `src/lib/exportCanvas.ts`
- Modify: `src/lib/exportCanvas.test.ts`

Draws the background image, then each layer's text (stroke before fill, matching the CSS `paint-order: stroke fill` meme-text look), onto a canvas sized to the template's real resolution, and resolves a PNG `Blob`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/exportCanvas.test.ts`:

```typescript
import { vi } from 'vitest'
import { renderCreationToBlob } from './exportCanvas'
import type { Layer } from './layers'

describe('renderCreationToBlob', () => {
  function mockContext() {
    const calls: { method: string; args: unknown[] }[] = []
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
      strokeText: (...args: unknown[]) => calls.push({ method: 'strokeText', args }),
      fillText: (...args: unknown[]) => calls.push({ method: 'fillText', args }),
      measureText: (text: string) => ({ width: text.length * 10 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
    }
    return { ctx, calls }
  }

  it("draws the background image first, then each layer's stroke before its fill", async () => {
    const { ctx, calls } = mockContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
    ) {
      cb(new Blob(['fake'], { type: 'image/png' }))
    })

    const image = document.createElement('img')
    const templateRow = { image_width: 600, image_height: 908 }
    const layers: Layer[] = [{ id: 'f1', label: 'hi', x: 10, y: 20, width: 100, height: 50, fontSize: 22, heightAuto: true }]

    const blob = await renderCreationToBlob(image, templateRow, layers)

    expect(blob.type).toBe('image/png')
    expect(calls[0]).toMatchObject({ method: 'drawImage', args: [image, 0, 0, 600, 908] })
    const strokeIndex = calls.findIndex((c) => c.method === 'strokeText')
    const fillIndex = calls.findIndex((c) => c.method === 'fillText')
    expect(strokeIndex).toBeGreaterThan(0)
    expect(fillIndex).toBeGreaterThan(strokeIndex)

    vi.restoreAllMocks()
  })

  it('rejects when no 2D context is available', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const image = document.createElement('img')
    await expect(renderCreationToBlob(image, { image_width: 10, image_height: 10 }, [])).rejects.toThrow(
      'Canvas 2D context is not available',
    )

    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: FAIL — `renderCreationToBlob` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/exportCanvas.ts`:

```typescript
import type { Layer } from './layers'

const LINE_HEIGHT_RATIO = 1.2
const STROKE_RATIO = 0.24
const TEXT_PADDING = 4

interface TemplateSize {
  image_width: number
  image_height: number
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  ctx.font = `bold ${layer.fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = layer.fontSize * STROKE_RATIO
  ctx.strokeStyle = 'black'
  ctx.fillStyle = 'white'

  const lines = wrapTextLines(ctx, layer.label, layer.width)
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO
  const centerX = layer.x + layer.width / 2

  lines.forEach((line, i) => {
    const y = layer.y + TEXT_PADDING + i * lineHeight
    ctx.strokeText(line, centerX, y)
    ctx.fillText(line, centerX, y)
  })
}

export function renderCreationToBlob(
  image: HTMLImageElement,
  templateRow: TemplateSize,
  layers: Layer[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = templateRow.image_width
  canvas.height = templateRow.image_height

  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas 2D context is not available'))

  ctx.drawImage(image, 0, 0, templateRow.image_width, templateRow.image_height)
  for (const layer of layers) {
    drawLayer(ctx, layer)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportCanvas.ts src/lib/exportCanvas.test.ts
git commit -m "feat: add renderCreationToBlob for full-resolution canvas export"
```

---

### Task 5: Wire the Export button in `EditorPage.tsx`

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`
- Modify: `src/features/editor/EditorPage.test.tsx`

Makes the Export button functional: renders via `renderCreationToBlob`, delivers via `canShareFile`/`shareFile`/`downloadBlob`, shows a spinner while working and a toast on completion (silent on a user-cancelled share).

- [ ] **Step 1: Write the failing tests**

First, update the existing assertion that Export stays disabled after picking a template — it now becomes enabled. In `src/features/editor/EditorPage.test.tsx`, find this line inside the `'shows a blank canvas and the template sidebar first...'` test:

```typescript
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
```

Replace it with:

```typescript
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
```

Then add the mocks and new test cases. **Mocking gotcha:** `vi.mock()` calls are hoisted above all imports, so a mock factory must not close over an outer `const` declared later in the file (that's a TDZ crash waiting to happen) — instead, have each factory create its own `vi.fn()` directly, then import that same function afterward to reconfigure/assert on it via `vi.mocked(...)`. Near the top of `EditorPage.test.tsx`, alongside the existing `vi.mock('../../lib/supabase', ...)`, add:

```typescript
vi.mock('../../lib/exportCanvas', () => ({
  renderCreationToBlob: vi.fn(),
}))
vi.mock('../../lib/exportDelivery', () => ({
  sanitizeFilename: (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '-'),
  canShareFile: vi.fn(),
  shareFile: vi.fn(),
  downloadBlob: vi.fn(),
}))
```

Then, alongside the file's other imports (after the mocks, so the mocked versions are what get imported):

```typescript
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { canShareFile, shareFile, downloadBlob } from '../../lib/exportDelivery'
```

Add a new `describe` block at the end of the file, inside the outer `describe('EditorPage', ...)`, before its closing `})`:

```typescript
  describe('Export', () => {
    beforeEach(() => {
      vi.mocked(renderCreationToBlob).mockReset().mockResolvedValue(new Blob(['fake'], { type: 'image/png' }))
      vi.mocked(canShareFile).mockReset().mockReturnValue(false)
      vi.mocked(shareFile).mockReset().mockResolvedValue(undefined)
      vi.mocked(downloadBlob).mockReset()
    })

    it('downloads the rendered PNG and shows a toast when file-sharing is unsupported', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(renderCreationToBlob).toHaveBeenCalled()
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.png$/))
      expect(shareFile).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Downloaded')
    })

    it('shares via the Web Share API when file-sharing is supported, showing a toast on success', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(shareFile).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(/\.png$/))
      expect(downloadBlob).not.toHaveBeenCalled()
      expect(await screen.findByRole('status')).toHaveTextContent('Shared')
    })

    it('shows no toast when the user cancels the native share sheet', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      const abortError = new Error('cancelled')
      abortError.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(abortError)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await Promise.resolve() // let the rejected promise settle
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('shows an error toast when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('boom'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(await screen.findByRole('status')).toHaveTextContent('failed')
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/editor/EditorPage.test.tsx`
Expected: FAIL — Export button has no click behavior yet, no `role="status"` element exists, and the disabled-state assertion is now wrong.

- [ ] **Step 3: Write the minimal implementation**

In `src/features/editor/EditorPage.tsx`:

Add imports (alongside the existing ones near the top):

```typescript
import { Loader2 } from 'lucide-react'
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { canShareFile, downloadBlob, sanitizeFilename, shareFile } from '../../lib/exportDelivery'
```

Add state, alongside the other `useState` calls near the top of the component:

```typescript
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null)
```

Add a toast auto-dismiss effect, alongside the other `useEffect` calls:

```typescript
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])
```

Add the export handler, near `handleQuickSave`:

```typescript
  async function handleExport() {
    if (!source || source.type !== 'template' || !templateRow || !imgRef.current) return
    setExporting(true)
    try {
      const blob = await renderCreationToBlob(imgRef.current, templateRow, layers)
      const filename = `${sanitizeFilename(savedMeta?.name ?? source.name)}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      if (canShareFile(file)) {
        try {
          await shareFile(file, filename)
          setToast({ message: 'Shared!', isError: false })
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') {
            setToast({ message: 'Export failed — try again.', isError: true })
          }
        }
      } else {
        downloadBlob(blob, filename)
        setToast({ message: 'Downloaded!', isError: false })
      }
    } catch {
      setToast({ message: 'Export failed — try again.', isError: true })
    } finally {
      setExporting(false)
    }
  }
```

Replace the Export button:

```typescript
            <Button size="sm" variant="outline" disabled>
              Export
            </Button>
```

with:

```typescript
            <Button
              size="sm"
              variant="outline"
              disabled={source?.type !== 'template' || !templateRow || exporting}
              onClick={handleExport}
            >
              {exporting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Export
            </Button>
```

Add the toast, at the end of the component's returned JSX (as a sibling of the closing `</SaveDialog>`/`<ConfirmDialog>` elements, just before the final closing `</div>`):

```typescript
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg ${
            toast.isError ? 'bg-red-600' : 'bg-neutral-900'
          }`}
        >
          {toast.message}
        </div>
      )}
```

Finally, add `crossOrigin="anonymous"` to the template `<img>` element (the one with `ref={imgRef}`). Without this, `canvas.toBlob()` in `renderCreationToBlob` throws a `SecurityError` for a "tainted" canvas — the `template-images` Supabase bucket is public with permissive CORS (confirmed in `supabase/migrations/20260914214950_init.sql`), so this alone is enough to make the fetch CORS-compliant:

```typescript
              <img
                ref={imgRef}
                src={source.blankImageUrl}
                alt={source.name}
                crossOrigin="anonymous"
```

(This is the existing `<img ref={imgRef} src={...} alt={...}` opening — add the `crossOrigin="anonymous"` line right after `alt`, before the existing `style={...}` prop.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/editor/EditorPage.test.tsx`
Expected: PASS (all tests in the file, including the 4 new Export tests and the updated disabled-state assertion)

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm run test && npm run lint`
Expected: All tests pass, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git commit -m "feat: make the Export button render and deliver a real PNG"
```

---

### Task 6: Manual verification in the browser

Automated tests mock the canvas/share/download APIs — this task confirms the real thing works end-to-end, which nothing above can verify.

- [ ] **Step 1: Start (or reuse) the dev server and open it in the Browser pane**

The dev server should already be running on port 5173 from earlier work this session; open `http://localhost:5173` in the Browser pane if it isn't already.

- [ ] **Step 2: Confirm the template image still loads after adding `crossOrigin="anonymous"`**

Pick the "Two Buttons" template and check it renders normally (no broken-image icon, no console error). `crossOrigin="anonymous"` makes the browser perform a real CORS-mode fetch instead of a plain one — if the Supabase bucket's CORS headers don't actually behave as assumed, this is where it would visibly break, before ever getting to the export step. Check `read_console_messages` for any CORS-related error.

- [ ] **Step 3: Desktop download path**

Type something into a caption, click Export. Verify:
- The button briefly shows a spinner and is disabled while exporting.
- A file download is triggered (check `read_network_requests` or the browser's own download indicator — no network request should fire, since this is a local Blob download, not a server round-trip).
- A toast reading "Downloaded!" appears and disappears after a few seconds.
- Use `javascript_tool` to sanity-check the exported image's real dimensions match the template (600×908 for Two Buttons) — e.g. draw the most recently created object URL to a fresh `<img>` and read `naturalWidth`/`naturalHeight`, or inspect network/download metadata if the pane surfaces it.

- [ ] **Step 4: Mobile share path**

Use `resize_window` with the `mobile` preset. Since real phones aren't available in this environment, verify what can be verified here: `navigator.share`/`navigator.canShare` are unlikely to be implemented in this headless browser context, so this will likely still exercise the download path — confirm it still works correctly at mobile width (no layout regressions, toast still visible and correctly positioned, doesn't overlap the FAB or the more-options menu). Note in the session summary that the actual native share sheet needs a real mobile browser to verify, since it can't be exercised here.

- [ ] **Step 5: Verify the exported text looks right**

Check that a caption with a font size and long text that wraps on-screen also wraps reasonably in the downloaded PNG (open the downloaded file, or draw it to an `<img>`/`<canvas>` in the page via `javascript_tool` and inspect it), and that it reads white-fill-black-outline like the on-screen editor.

- [ ] **Step 6: Reset viewport**

Call `resize_window` with the `desktop` preset to leave the pane in its normal state.

---

## Notes for whoever executes this

- `templateRow` in `EditorPage.tsx` is already computed earlier in the component (`const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined`) — Task 5 reuses it, it does not need to be recomputed.
- `layers` is already in scope as component state — Task 5 passes it directly to `renderCreationToBlob`.
- Do not implement anything related to `exported_image_url` or the `creation-exports` storage bucket — explicitly out of scope, confirmed with the user (see the design doc's "Explicitly out of scope" section).
