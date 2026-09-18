-- Seed a new classic template: Hulk Always Angry (the 3-panel Avengers
-- still — Captain America asking a question, then Bruce Banner turning
-- and revealing his secret). Image uploaded to storage bucket
-- `template-images` at hulk-always-angry/blank.png, real size 500x881.
-- 2 caption fields, one per the question/reveal panels (top and bottom) —
-- the middle panel is usually left uncaptioned in this format, and a user
-- can always add more text via the +Text FAB same as any other template.
insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description)
values (
  'Hulk Always Angry',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/hulk-always-angry/blank.png',
  'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/hulk-always-angry/blank.png',
  500,
  881,
  array['reveal', 'secret', 'reaction'],
  'A tense question in the top panel gets answered in the bottom panel by revealing the secret all along.'
);

insert into template_fields (template_id, label, position_x, position_y, width, height, rotation, font_size, order_index)
select id, 'Caption 1', 20, 225, 460, 55, 0, 28, 0 from templates where name = 'Hulk Always Angry'
union all
select id, 'Caption 2', 20, 815, 460, 60, 0, 28, 1 from templates where name = 'Hulk Always Angry';
