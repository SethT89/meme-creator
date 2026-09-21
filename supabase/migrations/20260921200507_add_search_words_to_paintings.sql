-- Words people would plausibly type that the painting seed left out (found by trying searches).
update templates set tags = tags || array['wrestle', 'fight'] where name = 'Wrestling a Lion' and not ('wrestle' = any(tags));
update templates set tags = tags || array['kitty', 'fat'] where name = 'Buff Cat' and not ('kitty' = any(tags));
update templates set tags = tags || array['church'] where name in ('Bishop and Pet Dragon', 'Monk Drinking Wine') and not ('church' = any(tags));
