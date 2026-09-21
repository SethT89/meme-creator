-- Seed eight more templates: six "random" images (no set format, caption them however
-- you like) and two classic two-panel formats (UNO Draw 25, Vanya and Five drive-by).
--
-- Images live in the `template-images` bucket (originals + a small thumbnail under
-- thumbs/, made with scripts/template-thumbnail.mjs). Real pixel sizes read with sips.
--
-- Tags: random images always carry `random` (what separates them from classic formats in the
-- one shared list) plus words people would actually search for — the subject, the category
-- (animals / costume / wholesome / vehicles / movies...) and the mood. Search matches whole
-- words in name, tags and description (tags weigh more than the description), with no
-- synonyms, so the obvious search words are spelled out. `animals` is only used for real
-- animals (the camel); the toy alligator and the slug costume are tagged for what they are.
--
-- Random images get no template_fields (blank canvas + the +Text button). The two classic
-- formats get default caption boxes where captions naturally go, like Hulk Always Angry.

insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description, thumbnail_url)
values
  (
    'Barbie Riding an Alligator',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/barbie-alligator.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/barbie-alligator.webp',
    700, 471,
    array['random', 'absurd', 'toys', 'vehicles', 'alligator', 'doll'],
    'A Barbie-style doll rides a toy alligator across the hood of a rusty Ford truck.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/barbie-alligator.jpg'
  ),
  (
    'Laughing Kid and Camel',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/camel-and-kid.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/camel-and-kid.webp',
    700, 609,
    array['random', 'animals', 'wholesome', 'laughing', 'happy', 'kid'],
    'A little girl and a camel crack up together on an open grassland -- pure, contagious joy.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/camel-and-kid.jpg'
  ),
  (
    'Matching Plaid Coats',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/matching-coats.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/matching-coats.webp',
    700, 864,
    array['random', 'wholesome', 'fashion', 'matching', 'street', 'elderly'],
    'A man and an older woman in matching plaid coats meet on the street, both thrilled.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/matching-coats.jpg'
  ),
  (
    'Slug Costume',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/slug-costume.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/slug-costume.webp',
    700, 811,
    array['random', 'absurd', 'costume', 'halloween', 'slug', 'night'],
    'Someone trick-or-treating in a full slug costume, complete with a plastic slime trail.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/slug-costume.jpg'
  ),
  (
    'Terrible Bert',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/terrible-bert.jpeg',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/terrible-bert.jpeg',
    600, 678,
    array['random', 'costume', 'cosplay', 'cursed', 'creepy', 'sesame'],
    'A man in unsettlingly literal Bert face paint, unibrow and striped sweater -- Sesame Street gone wrong.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/terrible-bert.jpg'
  ),
  (
    'Anchorman News Team',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/anchorman-news-team.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/anchorman-news-team.webp',
    868, 438,
    array['random', 'movies', 'comedy', 'group', 'squad', 'suits'],
    'Ron Burgundy and the Channel 4 news team stand shoulder to shoulder in loud 70s suits, ready to rumble.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/anchorman-news-team.jpg'
  ),
  (
    'UNO Draw 25',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/uno-draw-25/blank.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/uno-draw-25/blank.webp',
    500, 494,
    array['reaction', 'decision', 'uno', 'cards', 'stubborn', 'refusal'],
    'A UNO card gives an ultimatum -- do it "or draw 25" -- and the man on the right would rather draw the 25.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/uno-draw-25/blank.jpg'
  ),
  (
    'Vanya and Five Drive-By',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/vanya-and-five-drive-by/blank.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/vanya-and-five-drive-by/blank.webp',
    1080, 1080,
    array['reaction', 'shocked', 'awkward', 'staring', 'tv', 'cars'],
    'Two Umbrella Academy characters pass in separate cars and lock eyes in shock -- the ultimate awkward run-in.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/vanya-and-five-drive-by/blank.jpg'
  );

-- Default caption boxes for the two classic formats.
-- UNO Draw 25 (500x494): one box in the blank space of the card, above the printed "OR draw 25".
insert into template_fields (template_id, label, position_x, position_y, width, height, rotation, font_size, order_index)
select id, 'Caption 1', 38, 118, 175, 125, 0, 24, 0 from templates where name = 'UNO Draw 25';

-- Vanya and Five Drive-By (1080x1080): one box per panel, at the left where the cars' bodies are, clear of both faces.
insert into template_fields (template_id, label, position_x, position_y, width, height, rotation, font_size, order_index)
select id, 'Caption 1', 30, 30, 500, 160, 0, 60, 0 from templates where name = 'Vanya and Five Drive-By'
union all
select id, 'Caption 2', 30, 880, 500, 160, 0, 60, 1 from templates where name = 'Vanya and Five Drive-By';
