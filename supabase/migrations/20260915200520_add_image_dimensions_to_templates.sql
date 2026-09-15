-- Store each template's blank image dimensions directly, rather than relying
-- on the browser measuring the loaded <img> (unreliable/untestable — jsdom
-- doesn't actually load images). Used to position template_fields as
-- percentages of the real image size regardless of on-screen display size.
alter table templates
  add column image_width integer,
  add column image_height integer;

update templates set image_width = 600, image_height = 908
where id = '11111111-1111-1111-1111-111111111111';

alter table templates
  alter column image_width set not null,
  alter column image_height set not null;
