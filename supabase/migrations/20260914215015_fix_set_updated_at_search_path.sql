-- Fix "Function Search Path Mutable" security advisory on set_updated_at.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
