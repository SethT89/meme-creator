-- Local dev seed data. Runs on `supabase db reset` (local only, never on remote).

-- The single hardcoded v1 user. Kept as a plain row (no auth.users dependency
-- yet). When real auth is added, replace this with a real auth user and add the
-- FK on templates.created_by / creations.user_id.
-- id: 00000000-0000-0000-0000-000000000001
