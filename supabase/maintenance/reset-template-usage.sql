-- Pre-launch reset of template usage data. NOT a migration — never runs automatically.
-- Run manually, only on the owner's explicit go-ahead, right before real users arrive:
-- everything logged before then is test data under the shared v1 user id.
--
-- Deletes every usage event (picks, saves, exports) and zeroes the cached counters on templates.
-- It does NOT delete saved creations — those are real rows in My Saves.
delete from template_usage_events;

update templates
   set use_count_total = 0,
       use_count_7d    = 0,
       last_used_at    = null,
       save_count      = 0,
       export_count    = 0;
