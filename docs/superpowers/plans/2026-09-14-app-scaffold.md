# App Scaffold & Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite + React + TypeScript app (Tailwind, shadcn-style primitives, TanStack Query, React Router, Supabase client), prove the full stack talks to the real Supabase project end-to-end, and get it auto-deploying to Cloudflare Pages on every push to `main`.

**Architecture:** A client-only SPA (no server) that talks directly to Supabase using the `anon` key; Row Level Security on the Supabase side is what protects data. React Router handles the four v1 routes; TanStack Query owns server-state caching; a small `components/ui/` layer holds reusable, Tailwind-styled primitives modeled on shadcn/ui (code copied into the repo, not an npm dependency). Full design rationale is in [`docs/superpowers/specs/2026-09-14-app-scaffold-architecture-design.md`](../specs/2026-09-14-app-scaffold-architecture-design.md).

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS v4, React Router, TanStack Query, `@supabase/supabase-js`, class-variance-authority + tailwind-merge (shadcn-style primitives), ESLint (flat config) + Prettier, Vitest + React Testing Library.

---

## Before you start

Run every command from the repo root: `/Users/seththomas/Desktop/Claude_Projects/Meme_Creator`. The repo already has `.git`, `package.json` (with a `supabase` CLI devDependency and `db:*` scripts — leave those alone), `supabase/` (applied migrations), `.env.example`, `.mcp.json`, and `README.md`. Don't overwrite any of those; this plan only adds to them.

The Supabase MCP server is already connected and authenticated in this environment (tools named `mcp__supabase__*`). Where a step says "via the Supabase MCP tool," use that tool directly rather than shelling out to the CLI — it's already proven to work and needs no additional login.

---

### Task 1: Vite + React + TypeScript base scaffold

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Install core dependencies**

Run:
```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Write `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Meme Creator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Write `src/index.css`**

```css
:root {
  color-scheme: light dark;
}

body {
  margin: 0;
}
```

- [ ] **Step 9: Write `src/App.tsx`**

```tsx
function App() {
  return <div />
}

export default App
```

- [ ] **Step 10: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 11: Add build scripts to `package.json`**

Add these three entries to the existing `"scripts"` object (keep the `db:*` scripts already there):

```json
"dev": "vite",
"build": "tsc -b && vite build",
"preview": "vite preview"
```

- [ ] **Step 12: Verify the build**

Run: `npm run build`
Expected: exits 0, prints a Vite build summary, and creates `dist/index.html`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src/
git commit -m "feat: scaffold Vite + React + TypeScript base

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: ESLint + Prettier

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier eslint-config-prettier
```

- [ ] **Step 2: Write `eslint.config.js`**

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  eslintConfigPrettier,
)
```

- [ ] **Step 3: Write `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 4: Write `.prettierignore`**

```
dist
node_modules
supabase/.temp
```

- [ ] **Step 5: Add scripts to `package.json`**

```json
"lint": "eslint .",
"format": "prettier --write ."
```

- [ ] **Step 6: Verify**

Run: `npm run lint`
Expected: exits 0, no errors reported.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json
git commit -m "chore: add ESLint + Prettier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Tailwind CSS v4

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/index.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Edit `vite.config.ts`** to add the Tailwind plugin

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Edit `src/index.css`** to import Tailwind

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

body {
  margin: 0;
}
```

- [ ] **Step 4: Edit `src/App.tsx`** to use a Tailwind utility class, so the next step can prove the pipeline works

```tsx
function App() {
  return <div className="p-8" />
}

export default App
```

- [ ] **Step 5: Verify Tailwind is actually generating CSS**

Run:
```bash
npm run build
grep -o "\.p-8" dist/assets/*.css
```
Expected: `npm run build` exits 0; the grep prints `.p-8` (proves Tailwind processed the class and emitted real CSS, not just passed the className through unstyled).

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/index.css src/App.tsx package.json package-lock.json
git commit -m "feat: add Tailwind CSS v4

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Vitest + React Testing Library, first smoke test

**Files:**
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Edit `vite.config.ts`** to add the Vitest config block

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
})
```

- [ ] **Step 3: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

(The `/vitest` subpath — not the bare package — is what correctly types `expect(...).toBeInTheDocument()` and friends against Vitest's `expect`.)

- [ ] **Step 4: Add the test script to `package.json`**

```json
"test": "vitest run"
```

- [ ] **Step 5: Write the failing test — `src/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Meme Creator' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `npm run test`
Expected: FAIL — `App.tsx` currently renders an empty `<div />`, so no heading exists yet.

- [ ] **Step 7: Make it pass — edit `src/App.tsx`**

```tsx
function App() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Meme Creator</h1>
    </main>
  )
}

export default App
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `npm run test`
Expected: PASS — 1 test passed.

- [ ] **Step 9: Commit**

```bash
git add vite.config.ts src/test/ src/App.test.tsx src/App.tsx package.json package-lock.json
git commit -m "test: add Vitest + RTL, App smoke test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: React Router with placeholder pages

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/routes.test.tsx`
- Create: `src/features/gallery/GalleryPage.tsx`
- Create: `src/features/templates/NewCreationPage.tsx`
- Create: `src/features/editor/EditorPage.tsx`
- Create: `src/features/templates/AdminNewTemplatePage.tsx`
- Create: `src/routes.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Install dependency**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Prepare `src/App.test.tsx` for router context** (App is about to render `<Outlet />`, which requires a Router ancestor)

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('renders the app heading', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Meme Creator' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test and verify it still passes** (safety check before changing `App.tsx`)

Run: `npm run test`
Expected: PASS.

- [ ] **Step 4: Write `src/components/layout/AppShell.tsx`** — the persistent header + routed content area (kept as its own file per the project structure, rather than inline in `App.tsx`, since `layout/` is where app chrome belongs)

```tsx
import { Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div>
      <header className="p-8">
        <h1 className="text-3xl font-bold">Meme Creator</h1>
      </header>
      <Outlet />
    </div>
  )
}
```

- [ ] **Step 5: Edit `src/App.tsx`** to render the shell (App stays the route root element; `AppShell` holds the actual layout)

```tsx
import { AppShell } from './components/layout/AppShell'

function App() {
  return <AppShell />
}

export default App
```

- [ ] **Step 6: Run the test and verify it still passes** (confirms the refactor didn't break anything)

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Write the failing test — `src/routes.test.tsx`** (this references files that don't exist yet)

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'

describe('routes', () => {
  it('renders the gallery page at /', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('renders the editor page at /editor/:creationId', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/editor/abc123'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run the test and verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module './routes'`.

- [ ] **Step 9: Write the four placeholder page components**

`src/features/gallery/GalleryPage.tsx`:
```tsx
export function GalleryPage() {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">My Creations</h2>
    </section>
  )
}
```

`src/features/templates/NewCreationPage.tsx`:
```tsx
export function NewCreationPage() {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">New Creation</h2>
    </section>
  )
}
```

`src/features/editor/EditorPage.tsx`:
```tsx
export function EditorPage() {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">Editor</h2>
    </section>
  )
}
```

`src/features/templates/AdminNewTemplatePage.tsx`:
```tsx
export function AdminNewTemplatePage() {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">Add Template</h2>
    </section>
  )
}
```

- [ ] **Step 10: Write `src/routes.tsx`**

```tsx
import type { RouteObject } from 'react-router-dom'
import App from './App'
import { GalleryPage } from './features/gallery/GalleryPage'
import { NewCreationPage } from './features/templates/NewCreationPage'
import { EditorPage } from './features/editor/EditorPage'
import { AdminNewTemplatePage } from './features/templates/AdminNewTemplatePage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <GalleryPage /> },
      { path: 'new', element: <NewCreationPage /> },
      { path: 'editor/:creationId', element: <EditorPage /> },
      { path: 'admin/templates/new', element: <AdminNewTemplatePage /> },
    ],
  },
]
```

- [ ] **Step 11: Run the test and verify it passes**

Run: `npm run test`
Expected: PASS — 3 tests passed (App + 2 routes tests).

- [ ] **Step 12: Wire the router into `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'
import './index.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

- [ ] **Step 13: Verify the full build still works**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 14: Commit**

```bash
git add src/
git commit -m "feat: add React Router with placeholder pages, extract AppShell layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: TanStack Query provider

**Files:**
- Create: `src/lib/queryClient.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Install dependency**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Write `src/lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
})
```

- [ ] **Step 3: Edit `src/main.tsx`** to wrap the app in the provider

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { routes } from './routes'
import './index.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Verify**

Run:
```bash
npm run build
npm run test
```
Expected: both exit 0 (existing tests still pass — nothing consumes React Query yet, so no new test is expected here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queryClient.ts src/main.tsx package.json package-lock.json
git commit -m "feat: add TanStack Query provider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Supabase client, env vars, and generated types

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/supabase.test.ts`
- Create: `src/types/database.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`
- Modify: `.env.local` (not committed — see Step 6)

- [ ] **Step 1: Install dependency**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Edit `src/vite-env.d.ts`** to type the two client-safe env vars

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Generate database types**

Use the Supabase MCP tool `mcp__supabase__generate_typescript_types` (no arguments) and write its `types` output verbatim to `src/types/database.ts`. (If MCP isn't available in your environment, the equivalent CLI command is `npx supabase gen types typescript --project-id yjrzyvattombesoqhtpy --schema public > src/types/database.ts`.)

- [ ] **Step 4: Verify the generated types**

Run: `grep -E "creations|template_fields|templates" src/types/database.ts`
Expected: all three table names appear (proves the file reflects the real schema, not a stale/partial generation).

- [ ] **Step 5: Write the failing test — `src/lib/supabase.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(import('./supabase')).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('creates a client when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabase } = await import('./supabase')
    expect(supabase).toBeDefined()
  })
})
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module './supabase'`.

- [ ] **Step 7: Write `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Add the client-safe vars to `.env.example`**

Add these two lines (the file already has `SUPABASE_URL` / `SUPABASE_ANON_KEY` for the CLI/MCP server — these are additional, `VITE_`-prefixed copies for the browser bundle):

```
# Client-safe copies for the app itself (Vite only exposes VITE_-prefixed vars to the browser)
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

- [ ] **Step 10: Add the same two vars to `.env.local`**

`.env.local` is gitignored and not read by this plan's tools directly — get the real values via `mcp__supabase__get_project_url` and `mcp__supabase__get_publishable_keys`, then add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (using those real values) as two new lines in `.env.local`, alongside the existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` entries. Do not remove or change the existing entries.

- [ ] **Step 11: Verify the full build**

Run: `npm run build`
Expected: exits 0. (The build itself doesn't touch Supabase over the network — `tsc -b` only type-checks, and `vite build` only needs the env vars to be *present*, not valid, since nothing calls `supabase.from(...)` yet.)

- [ ] **Step 12: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts src/types/database.ts src/vite-env.d.ts .env.example package.json package-lock.json
git commit -m "feat: add Supabase client, generated types, env config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(`.env.local` is gitignored — nothing to commit there.)

---

### Task 8: Prove the stack end-to-end — `useTemplates` wired into the gallery

**Files:**
- Create: `src/lib/queries/templates.ts`
- Create: `src/lib/queries/templates.test.tsx`
- Modify: `src/features/gallery/GalleryPage.tsx`
- Modify: `src/routes.test.tsx`

This task is the actual proof that Vite + React + TanStack Query + the Supabase client + RLS are wired correctly end-to-end, not just individually scaffolded.

- [ ] **Step 1: Write the failing test — `src/lib/queries/templates.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTemplates } from './templates'

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [{ id: '1', name: 'Drake' }], error: null }),
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTemplates', () => {
  it('returns the list of templates from Supabase', async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([{ id: '1', name: 'Drake' }])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Write `src/lib/queries/templates.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select('*')
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Wire it into `src/features/gallery/GalleryPage.tsx`**

```tsx
import { useTemplates } from '../../lib/queries/templates'

export function GalleryPage() {
  const { data: templates, isLoading } = useTemplates()

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">My Creations</h2>
      <p className="text-sm text-slate-500">
        {isLoading ? 'Loading templates…' : `${templates?.length ?? 0} templates available`}
      </p>
    </section>
  )
}
```

- [ ] **Step 6: Update `src/routes.test.tsx`** — `GalleryPage` now needs a `QueryClientProvider` ancestor, and its Supabase call must be mocked so tests stay hermetic (no real network calls)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from './routes'

vi.mock('./lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('routes', () => {
  it('renders the gallery page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'My Creations' })).toBeInTheDocument()
  })

  it('renders the editor page at /editor/:creationId', () => {
    renderAt('/editor/abc123')
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run all tests and verify they pass**

Run: `npm run test`
Expected: PASS — all tests green (App, routes, templates hook).

- [ ] **Step 8: Verify against the real Supabase project**

Run `npm run dev`, open the printed local URL in a browser, and confirm the gallery page reads "0 templates available" without a console error (proves the real `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` values in `.env.local` work against the live project — 0 is correct, no templates have been added yet). Stop the dev server afterward.

- [ ] **Step 9: Commit**

```bash
git add src/lib/queries/ src/features/gallery/GalleryPage.tsx src/routes.test.tsx
git commit -m "feat: wire useTemplates end-to-end through Supabase and TanStack Query

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: First shadcn-style UI primitive — `Button`

**Files:**
- Create: `src/lib/cn.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/button.test.tsx`

- [ ] **Step 1: Install dependencies**

```bash
npm install clsx tailwind-merge class-variance-authority
```

- [ ] **Step 2: Write the failing test — `src/components/ui/button.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('Button', () => {
  it('renders its children and responds to clicks', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('applies the outline variant class', () => {
    render(<Button variant="outline">Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('border')
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module './button'`.

- [ ] **Step 4: Write `src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Write `src/components/ui/button.tsx`**

```tsx
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-slate-900 text-white hover:bg-slate-700',
        outline: 'border border-slate-300 bg-transparent hover:bg-slate-100',
        ghost: 'bg-transparent hover:bg-slate-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cn.ts src/components/ui/ package.json package-lock.json
git commit -m "feat: add cn helper and first shadcn-style primitive (Button)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Final polish — scripts, docs

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Confirm `package.json` scripts are complete**

The `"scripts"` object should now contain (in addition to the untouched `db:*` scripts): `dev`, `build`, `preview`, `lint`, `format`, `test`. Read the file and add any that are missing from earlier tasks.

- [ ] **Step 2: Update `README.md`** — add a section after the existing "Local setup" section:

```markdown
## Running the app

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build to dist/
npm run test     # run the test suite once
npm run lint     # ESLint
npm run format   # Prettier, writes changes
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`
(see `.env.example`) — these are client-safe copies of the values already used
by the Supabase CLI/MCP server, just re-exposed with the `VITE_` prefix Vite
requires for browser-visible env vars.
```

- [ ] **Step 3: Run the full verification sweep**

Run:
```bash
npm run lint
npm run build
npm run test
```
Expected: all three exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "docs: document app dev scripts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

### Task 11: Connect Cloudflare Pages and verify the live deploy

This task is mostly a **you** step — it's tied to your Cloudflare login, which Claude Code cannot act on directly.

**You:**

- [ ] **Step 1:** Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
- [ ] **Step 2:** Select the `SethT89/meme-creator` repository.
- [ ] **Step 3:** Set build configuration:
  - Framework preset: **Vite**
  - Build command: `npm run build`
  - Build output directory: `dist`
- [ ] **Step 4:** Under **Environment variables**, add:
  - `VITE_SUPABASE_URL` = your Supabase project URL (`https://yjrzyvattombesoqhtpy.supabase.co`)
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/publishable key (same value as in `.env.local`)
- [ ] **Step 5:** Save and deploy. Cloudflare will build and deploy from `main`.
- [ ] **Step 6:** Once the deploy finishes, copy the `*.pages.dev` URL Cloudflare gives you and share it here.

**Me (once you've shared the URL):**

- [ ] **Step 7: Verify the live deploy**

Fetch the deployed URL and confirm the page loads and contains the expected content:

```bash
curl -s "<the pages.dev URL you were given>" | grep -o "Meme Creator"
```
Expected: prints `Meme Creator` (confirms the built `index.html` served by Cloudflare Pages matches what we built locally).

- [ ] **Step 8: Confirm auto-deploy works**

Make a trivial verifiable change (e.g. a comment or whitespace tweak in a file already touched by this plan), commit and push it, then re-run the Step 7 check a minute or two later to confirm Cloudflare picked up the new commit automatically — no manual deploy trigger needed.

---

## Definition of done

- `npm run dev`, `npm run build`, `npm run lint`, `npm run test` all succeed locally.
- The gallery page at `/` renders against the **real** Supabase project (Task 8, Step 8).
- Every push to `main` on GitHub produces a new live deploy on Cloudflare Pages with no manual step.
