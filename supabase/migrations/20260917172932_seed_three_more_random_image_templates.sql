-- Three more "random image" templates (see 20260917172048's comment for
-- the general shape: tagged 'random', zero template_fields — no fixed
-- caption layout, the blank canvas + existing "+Text" FAB is the whole
-- captioning experience for these).
-- Images uploaded to storage bucket `template-images` at
-- random/chicken-skydiving.jpg, random/horse-drawn-car.jpg,
-- random/watermelon-head-guy.jpg.
insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description)
values
  (
    'Skydiving Chicken',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/chicken-skydiving.jpg',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/chicken-skydiving.jpg',
    599,
    542,
    array['random', 'absurd', 'animals'],
    'A daredevil chicken in a skydiving harness, caught mid-freefall high above the farmland below.'
  ),
  (
    'Horse-Drawn Car',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/horse-drawn-car.jpg',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/horse-drawn-car.jpg',
    1000,
    667,
    array['random', 'absurd', 'irony'],
    'A gutted, wheel-less car strapped to a horse-drawn cart, hauled down the street the old-fashioned way.'
  ),
  (
    'Watermelon Helmet Guy',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/watermelon-head-guy.jpg',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/watermelon-head-guy.jpg',
    493,
    360,
    array['random', 'absurd', 'silly'],
    'A grinning man in a hollowed-out watermelon helmet and goggles, ready for takeoff.'
  );
