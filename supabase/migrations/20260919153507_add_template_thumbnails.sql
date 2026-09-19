-- A small (<=160px, ~5-10 KB) thumbnail per template for the sidebar list, which loads
-- every template at once. Nullable: a template without one falls back to its full
-- image. Made by scripts/template-thumbnail.mjs, stored at thumbs/<original path>.jpg.
alter table public.templates add column if not exists thumbnail_url text;

-- Existing templates: their thumbnails were generated alongside the originals at the
-- mirrored path, e.g. .../template-images/random/a.webp -> .../template-images/thumbs/random/a.jpg
update public.templates
set thumbnail_url = regexp_replace(blank_image_url, '/template-images/(.+)\.[A-Za-z0-9]+$', '/template-images/thumbs/\1.jpg')
where thumbnail_url is null
  and blank_image_url like '%/template-images/%';
