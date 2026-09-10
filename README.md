# Meme Creator

A web app for creating memes two ways — from a recognizable template (positioned
text fields) or completely freeform (upload any image, place text/stickers
anywhere). Every meme is saved to a personal gallery, **My Creations**.

Full spec: [`docs/meme-app-spec.md`](docs/meme-app-spec.md).

Status: **infrastructure setup**. No app framework scaffolded yet.

## Stack

| Layer    | Choice |
| -------- | ------ |
| Frontend | Web (TBD — chosen at build time) |
| Backend  | Supabase (Postgres + Storage) |
| Auth     | None in v1 — single hardcoded `user_id`, schema is auth-ready |

## Repository layout

```
docs/                     Spec and design notes
supabase/
  config.toml             Supabase CLI project config
  migrations/             Versioned SQL migrations (source of truth for schema)
  seed.sql                Local-only dev seed data
.env.example              Template for .env.local (gitignored)
.mcp.json                 Supabase MCP server config for Claude Code
```

## Local setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Create `.env.local`** from the template and fill in values from your
   Supabase project (Project Settings → API, and Account → Access Tokens):

   ```bash
   cp .env.example .env.local
   ```

3. **Export the two vars the MCP server needs** so Claude Code can pick them up
   (add to `~/.zshrc`, or use direnv):

   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   export SUPABASE_PROJECT_REF=your_project_ref
   ```

4. **Link the CLI to the remote project** and push the schema:

   ```bash
   npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
   npx supabase db push
   ```

## Working with the database

- **Schema changes** go in a new file under `supabase/migrations/` (never edit an
  applied migration). Apply with `npx supabase db push`.
- **Local Postgres** for iteration: `npx supabase start` / `npx supabase db reset`
  (requires Docker).
- The **Supabase MCP server** (configured in `.mcp.json`) lets Claude Code
  inspect schema and run queries against the linked project directly.

## Data model

`templates` · `template_fields` · `creations` — see the init migration and the
spec for details. `creations` is the unified gallery for both template-based and
freeform memes; `canvas_data` (jsonb) holds the full layer state.
