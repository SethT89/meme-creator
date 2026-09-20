-- Pre-launch reset of template usage data. NOT a migration — never runs automatically.
-- Run manually, only on the owner's explicit go-ahead, right before real users arrive:
-- everything logged before then is test data under the shared v1 user id.
--
-- Deletes every click event and zeroes the cached counters on templates.
delete from template_usage_events;

update templates
   set use_count_total = 0,
       use_count_7d    = 0,
       last_used_at    = null;
