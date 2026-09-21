-- Seed six more random images, all paintings or manuscript illustrations. Every one carries
-- `random` plus `painting` and `art` (so a search for either finds all of them), then the subject
-- and category words people would type. `animals` only where a real animal is shown (the cat, the
-- lion); dragons and sea monsters are tagged `dragon` / `monster` / `fantasy`. No template_fields:
-- these are blank canvases, captioned with the +Text button.
--
-- Also gives the existing Wanderer painting the same `painting` / `art` tags, so it is found by them too.

insert into templates (name, blank_image_url, example_image_url, image_width, image_height, tags, description, thumbnail_url)
values
  (
    'Magnificent Monster',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/magnificent-monster.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/magnificent-monster.webp',
    1000, 652,
    array['random', 'painting', 'art', 'monster', 'dragon', 'fantasy'],
    'A tiny swordsman stands on the back of a huge, mournful sea monster as onlookers weep and cheer around it.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/magnificent-monster.jpg'
  ),
  (
    'Buff Cat',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/buff-cat.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/buff-cat.webp',
    700, 632,
    array['random', 'animals', 'painting', 'art', 'cat', 'chonky'],
    'A gloriously round orange cat stands proudly on a bed, painted in Fernando Botero''s inflated style.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/buff-cat.jpg'
  ),
  (
    'Wrestling a Lion',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/wrestling-lion.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/wrestling-lion.webp',
    700, 1160,
    array['random', 'animals', 'painting', 'art', 'medieval', 'lion', 'wrestling'],
    'A worried-looking man in a pink robe pries open a lion''s jaws in a medieval manuscript.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/wrestling-lion.jpg'
  ),
  (
    'Bishop and Pet Dragon',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/bishop-and-pet-dragon.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/bishop-and-pet-dragon.webp',
    700, 1110,
    array['random', 'painting', 'art', 'medieval', 'dragon', 'pet', 'pope'],
    'A solemn bishop in full gold vestments walks his pet dragon on a red leash.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/bishop-and-pet-dragon.jpg'
  ),
  (
    'Dragon Eating a Man',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/dragon-eating-man.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/dragon-eating-man.webp',
    700, 809,
    array['random', 'painting', 'art', 'medieval', 'dragon', 'monster', 'absurd'],
    'A calm saint holds a monster on a leash while it chews a soldier''s leg and an army fires arrows at it.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/dragon-eating-man.jpg'
  ),
  (
    'Monk Drinking Wine',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/monk-drinking-wine.webp',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/random/monk-drinking-wine.webp',
    700, 688,
    array['random', 'painting', 'art', 'monk', 'wine', 'drinking'],
    'A rosy-cheeked monk savors a glass of wine with pure, smug satisfaction.',
    'https://yjrzyvattombesoqhtpy.supabase.co/storage/v1/object/public/template-images/thumbs/random/monk-drinking-wine.jpg'
  );

update templates
   set tags = tags || array['painting', 'art']
 where name = 'Wanderer Above the Sea of Fog' and not ('painting' = any(tags));
