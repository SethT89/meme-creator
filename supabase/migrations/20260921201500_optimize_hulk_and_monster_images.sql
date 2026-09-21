-- Point Hulk Always Angry at its optimized image (668 KB opaque PNG -> 44 KB WebP, same 500x881 pixels; the
-- PNG's alpha channel was fully unused). Also records that random/magnificent-monster.webp was re-encoded IN
-- PLACE (737 KB -> 129 KB, same 1000x652, same URL), which needs no row change.
--
-- NOTE: applied to production on 2026-09-21 through the app's REST API rather than apply_migration, because the
-- Supabase MCP server had lost its authorization at the time — so this file is NOT in the migration history table.
-- It is idempotent, so re-running it is harmless. The old blank.png is deliberately left in storage for now
-- (a restored editor draft can still point at it); it can be deleted later.
update templates
   set blank_image_url   = 'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/hulk-always-angry/blank.webp',
       example_image_url = 'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/hulk-always-angry/blank.webp'
 where name = 'Hulk Always Angry'
   and blank_image_url like '%hulk-always-angry/blank.png';
