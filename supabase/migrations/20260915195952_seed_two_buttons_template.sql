-- Seed the first real template: Two Buttons.
-- Image uploaded to storage bucket `template-images` at two-buttons/blank.jpg.
-- No separately-captioned "example" image exists yet, so example_image_url
-- reuses the blank image for now — swap in a real filled-in reference later.
insert into templates (id, name, blank_image_url, example_image_url)
values (
  '11111111-1111-1111-1111-111111111111',
  'Two Buttons',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/two-buttons/blank.jpg',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/two-buttons/blank.jpg'
);

-- Three caption fields: two button labels (top panel) + one bottom-panel caption.
-- Image is 600x908px. Positions are starting defaults, not pixel-perfect —
-- there's no interactive resize/reposition yet (deferred, see the UI/UX spec).
insert into template_fields (template_id, label, position_x, position_y, width, height, rotation, font_size, order_index)
values
  ('11111111-1111-1111-1111-111111111111', 'Caption 1', 30,  50,  220, 110, 0, 22, 0),
  ('11111111-1111-1111-1111-111111111111', 'Caption 2', 310, 70,  220, 110, 0, 22, 1),
  ('11111111-1111-1111-1111-111111111111', 'Caption 3', 60,  680, 480, 100, 0, 28, 2);
