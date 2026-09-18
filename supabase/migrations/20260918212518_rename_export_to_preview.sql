-- The original design saved a server-side "export" of each creation, but the
-- app's Export button only downloads a PNG to the user's device and nothing
-- ever wrote to these. What the gallery actually needs is a preview image
-- rendered on every save, so rename to say what it is.
--
-- Backward compatible with the deployed frontend: it only reads the old
-- column and treats null as "no image", and both are still null/empty here.

alter table creations rename column exported_image_url to preview_image_url;

comment on table creations is 'Personal gallery ("My Creations"). canvas_data holds the full layer state; preview_image_url is a rendered PNG refreshed on every save (used for gallery thumbnails and Download).';

-- The bucket has never held a file. (storage.buckets can't be deleted from
-- via SQL, so rename it in place instead of dropping and recreating.)
update storage.buckets set id = 'creation-previews', name = 'creation-previews' where id = 'creation-exports';

drop policy "v1 open read meme storage" on storage.objects;
drop policy "v1 open write meme storage" on storage.objects;
create policy "v1 open read meme storage" on storage.objects
  for select using (bucket_id in ('template-images', 'creation-assets', 'creation-previews'));
create policy "v1 open write meme storage" on storage.objects
  for all using (bucket_id in ('template-images', 'creation-assets', 'creation-previews'))
  with check (bucket_id in ('template-images', 'creation-assets', 'creation-previews'));
