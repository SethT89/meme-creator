# Canvas Speed-Dial FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled `+ Text` / `+ Sticker` toolbar buttons with a Material-style speed-dial FAB on the canvas: a circular `+`/`X` toggle that expands into 4 labeled placeholder actions (Add Emoji, Add Sticker, Add Image, Add Text).

**Architecture:** One new self-contained component, `CanvasFab`, with its own open/closed state and its own document-level click-outside listener (mirrors the pattern `EditorPage` already uses for deselecting the property bar). It's rendered as a child of `EditorPage`'s existing image-wrapper `<div>` so it can anchor with plain CSS `absolute` positioning, just outside that wrapper's bottom-right corner on desktop and as an overlay on it on mobile.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind v4, `lucide-react` (new dependency).

---

### Task 1: Add the `lucide-react` icon library

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install lucide-react
```

- [ ] **Step 2: Verify**

Run: `grep '"lucide-react"' package.json`
Expected: a line like `"lucide-react": "^0.xxx.x",` under `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react for icons"
```

---

### Task 2: `CanvasFab` component

**Files:**
- Create: `src/features/editor/CanvasFab.tsx`
- Test: `src/features/editor/CanvasFab.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/editor/CanvasFab.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasFab } from './CanvasFab'

describe('CanvasFab', () => {
  it('renders closed by default: only the main toggle, no action buttons', () => {
    render(<CanvasFab />)
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
  })

  it('clicking the main FAB opens the menu with all 4 actions, in order Emoji, Sticker, Image, Text', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))

    expect(screen.getByRole('button', { name: 'Close add menu' })).toBeInTheDocument()
    const expectedOrder = [
      screen.getByRole('button', { name: 'Add Emoji' }),
      screen.getByRole('button', { name: 'Add Sticker' }),
      screen.getByRole('button', { name: 'Add Image' }),
      screen.getByRole('button', { name: 'Add Text' }),
    ]
    // DOM order matches the visual top-to-bottom stacking order (flex-col),
    // and the main toggle renders last (bottom of the stack).
    expect(screen.getAllByRole('button').slice(0, 4)).toEqual(expectedOrder)
  })

  it('clicking an action button does not close the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

    expect(screen.getByRole('button', { name: 'Add Text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close add menu' })).toBeInTheDocument()
  })

  it('clicking the main FAB again closes the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close add menu' }))

    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
  })

  it('clicking anywhere outside the FAB closes the menu', async () => {
    render(<CanvasFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
    expect(screen.getByRole('button', { name: 'Add Text' })).toBeInTheDocument()

    // document.body is outside this component's own DOM subtree — same
    // pattern EditorPage's own outside-click deselect test uses.
    await userEvent.click(document.body)
    expect(screen.queryByRole('button', { name: 'Add Text' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- CanvasFab`
Expected: FAIL — `src/features/editor/CanvasFab.tsx` does not exist yet.

- [ ] **Step 3: Implement**

```tsx
// src/features/editor/CanvasFab.tsx
import { useEffect, useState } from 'react'
import { Plus, X, Type, Image as ImageIcon, Sticker, Smile } from 'lucide-react'

// Top-to-bottom stacking order when the menu is open — closest to the main
// FAB (rendered last, at the bottom of the stack) is the most likely first
// action a user reaches for.
const FAB_ACTIONS = [
  { key: 'emoji', label: 'Add Emoji', Icon: Smile },
  { key: 'sticker', label: 'Add Sticker', Icon: Sticker },
  { key: 'image', label: 'Add Image', Icon: ImageIcon },
  { key: 'text', label: 'Add Text', Icon: Type },
] as const

export function CanvasFab() {
  const [open, setOpen] = useState(false)

  // Closes the menu on a click anywhere outside it — the same document-level
  // pattern EditorPage already uses to deselect the property bar. Only
  // registered while open, and this component's own wrapper calls
  // stopPropagation on every click (see below), so this listener never fires
  // for a click that originated inside the FAB itself — including the main
  // toggle button, which manages open/closed directly via its own onClick.
  useEffect(() => {
    if (!open) return
    function handleDocumentClick() {
      setOpen(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [open])

  return (
    <div
      // Mobile (default): overlays the image's bottom-right corner directly
      // — there isn't reliably room to float outside the image on a narrow
      // viewport. Desktop (sm+): sits just outside the image wrapper's own
      // bottom-right corner, in the checkerboard working-area space, never
      // over the artwork.
      className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2.5 sm:-bottom-4 sm:-right-12"
      onClick={(e) => e.stopPropagation()}
    >
      {open &&
        FAB_ACTIONS.map(({ key, label, Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white">{label}</span>
            <button
              type="button"
              aria-label={label}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:opacity-80"
            >
              <Icon className="h-4 w-4" />
            </button>
          </div>
        ))}

      <button
        type="button"
        aria-label={open ? 'Close add menu' : 'Open add menu'}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:opacity-80"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- CanvasFab`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/CanvasFab.tsx src/features/editor/CanvasFab.test.tsx
git commit -m "feat: add CanvasFab speed-dial component"
```

---

### Task 3: Wire `CanvasFab` into `EditorPage`; remove `+ Text` / `+ Sticker`

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`
- Modify: `src/features/editor/EditorPage.test.tsx`

- [ ] **Step 1: Update the existing test and add new ones**

In `src/features/editor/EditorPage.test.tsx`, in the first test (`'shows a blank canvas and the template sidebar first...'`), replace this line:

```ts
    expect(screen.getByRole('button', { name: '+ Text' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
```

with:

```ts
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Text' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Sticker' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open add menu' })).toBeInTheDocument()
```

Then add a new test at the end of the `describe('EditorPage', ...)` block:

```ts
  it('does not show the add-menu FAB until a template is loaded', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    expect(screen.queryByRole('button', { name: 'Open add menu' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- EditorPage`
Expected: FAIL — `+ Text` / `+ Sticker` buttons still exist, no `CanvasFab` rendered yet.

- [ ] **Step 3: Implement**

In `src/features/editor/EditorPage.tsx`, add the import alongside the other feature-local imports:

```ts
import { PropertyBar } from './PropertyBar'
import { CanvasFab } from './CanvasFab'
```

Remove the two disabled buttons from the toolbar row:

```tsx
            <Button size="sm" variant="outline" disabled>
              + Text
            </Button>
            <Button size="sm" variant="outline" disabled>
              + Sticker
            </Button>
            <Button size="sm" variant="outline" disabled>
              Export
            </Button>
```

becomes:

```tsx
            <Button size="sm" variant="outline" disabled>
              Export
            </Button>
```

Render `CanvasFab` inside the image wrapper, right after the layers `@container` block and before that wrapper's closing tag:

```tsx
            {source?.type === 'template' && templateRow && (
              <div className="absolute inset-0 @container">
                {/* ...unchanged layers.map(...) block... */}
              </div>
            )}
            {source?.type === 'template' && <CanvasFab />}
          </div>
        </div>
```

(That closing `</div></div>` is the existing image-wrapper `<div className="relative inline-block ...">` and the canvas-scroll-area `<div className="flex flex-1 items-start justify-center overflow-auto">` around it — unchanged, just noting where the new line lands relative to them.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- EditorPage`
Expected: PASS (all cases)

- [ ] **Step 5: Run the full suite, build, lint**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git commit -m "feat: replace +Text/+Sticker with the CanvasFab speed-dial menu"
```

---

### Task 4: Live browser verification

**Files:** none (verification only)

- [ ] **Step 1: Full sweep**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 2: Desktop positioning**

Start the dev server, open `/`, pick the "Two Buttons" template. Verify the FAB sits just outside the image's bottom-right corner, in the checkerboard working area — not overlapping the image, not pinned to the far corner of the whole canvas panel.

- [ ] **Step 3: Open/closed behavior**

Click the FAB. Verify: icon swaps from `+` to `X`, 4 labeled buttons fan out upward in order Add Emoji, Add Sticker, Add Image, Add Text (closest to the main FAB). Click one of the mini-buttons — verify the menu stays open and nothing else happens (no error, no visible effect — expected, they're placeholders). Click the main FAB again — verify it closes. Reopen it, then click elsewhere on the canvas (e.g. the template image) — verify it closes.

- [ ] **Step 4: Mobile positioning**

Using `resize_window` (or the pane's own mobile preset) below the `sm` breakpoint, verify the FAB switches to overlaying the image's bottom-right corner directly, rather than floating outside it.

- [ ] **Step 5: Fix anything found, then re-run the full sweep**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean before moving to finishing-a-development-branch.
