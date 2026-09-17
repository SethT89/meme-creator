-- Seed the first "random image" template: a non-classic image (Caspar David
-- Friedrich's "Wanderer Above the Sea of Fog") for freeform captioning,
-- tagged 'random' to distinguish it from recognizable meme formats like Two
-- Buttons while still living in the same templates list (no separate
-- source_type or picker section). Deliberately has no template_fields rows
-- -- there's no fixed caption layout for this one, so the blank canvas
-- loads with zero pre-placed fields and the user places their own text via
-- the existing "+Text" FAB, same mechanism Two Buttons already uses for
-- fields added beyond its 3 defaults.
-- Image uploaded to storage bucket `template-images` at
-- random/wanderer-above-the-sea-of-fog.jpg.
insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description)
values (
  'Wanderer Above the Sea of Fog',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/wanderer-above-the-sea-of-fog.jpg',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/wanderer-above-the-sea-of-fog.jpg',
  400,
  512,
  array['random'],
  'No set format -- caption this one however you like.'
);
