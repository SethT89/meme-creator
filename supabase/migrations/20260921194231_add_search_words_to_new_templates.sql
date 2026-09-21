-- Two words people would plausibly type that the first seed left out (found by trying searches).
update templates set tags = tags || array['crocodile'] where name = 'Barbie Riding an Alligator' and not ('crocodile' = any(tags));
update templates set tags = tags || array['grandma'] where name = 'Matching Plaid Coats' and not ('grandma' = any(tags));
