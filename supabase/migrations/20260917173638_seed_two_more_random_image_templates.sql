-- Two more "random image" templates (see 20260917172048's comment for the
-- general shape: tagged 'random', zero template_fields).
-- Images uploaded to storage bucket `template-images` at
-- random/batman-spiderman-boost.webp, random/dirtbike-mower.webp.
-- Note: .webp, not .jpg — confirmed the bucket set the correct
-- image/webp content-type on upload, and WebP renders/exports (canvas
-- drawImage) identically to JPG in all supported browsers, so no
-- conversion was needed.
insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description)
values
  (
    'Batman Boosts Spider-Man',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/batman-spiderman-boost.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/batman-spiderman-boost.webp',
    700,
    847,
    array['random', 'absurd', 'superheroes'],
    'Batman gives Spider-Man a boost over the wall -- cosplay teamwork at its finest.'
  ),
  (
    'Dirt Bike Lawnmower',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/dirtbike-mower.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/dirtbike-mower.webp',
    700,
    700,
    array['random', 'absurd', 'vehicles'],
    'A dirt bike surgically combined with a push mower -- lawn care, but make it extreme.'
  );
