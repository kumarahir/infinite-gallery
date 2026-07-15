-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- after creating the project, before running the app.

create table public.cells (
  id            bigint generated always as identity primary key,
  x             integer not null,
  y             integer not null,
  cell_type     text not null check (cell_type in ('image', 'text')),
  text_content  text check (char_length(text_content) <= 280),
  image_path    text,
  image_width   integer,
  image_height  integer,
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint cells_unique_coord unique (x, y),
  constraint cells_content_matches_type check (
    (cell_type = 'text'  and text_content is not null and image_path is null) or
    (cell_type = 'image' and image_path is not null and text_content is null)
  )
);

create index cells_coord_range_idx on public.cells (x, y);

alter table public.cells enable row level security;

create policy "cells_select_public"
  on public.cells for select
  using (true);

create policy "cells_insert_authenticated"
  on public.cells for insert
  to authenticated
  with check (auth.uid() = created_by);

-- No update/delete policy for v1: RLS default-denies, which is the
-- correct "not implemented yet" behavior for editing/deleting cells.

-- Storage: create a bucket named `cells-images` via the Storage UI first
-- (Storage -> New bucket -> name "cells-images" -> Public bucket: ON),
-- then run these policies.

create policy "cells_images_public_read"
  on storage.objects for select
  using (bucket_id = 'cells-images');

create policy "cells_images_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cells-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- v1.1: admin moderation. Admins are listed in this table (add/remove via
-- `insert into public.admins (email) values ('you@example.com');` in the
-- SQL editor — no redeploy needed) and may remove any cell.

create table public.admins (
  email text primary key
);
alter table public.admins enable row level security;

create policy "admins_select_self"
  on public.admins for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "cells_delete_admin"
  on public.cells for delete
  to authenticated
  using (exists (
    select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email')
  ));

create policy "cells_images_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cells-images'
    and exists (
      select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- v1.2: normal (non-admin) users may upload at most 5 images per UTC
-- calendar day. Admins are exempt. Enforced in the insert policy itself
-- (not just client-side) so it can't be bypassed by calling the API
-- directly.

-- security definer is required here: this function is called from RLS
-- policies (including admins_select_admin, added later below), so its own
-- internal query must bypass admins' RLS rather than re-trigger it — without
-- this, is_admin() recurses into itself indefinitely (Postgres error 54001,
-- stack depth exceeded) every time it runs.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email')
  );
$$;

alter policy "cells_insert_authenticated"
  on public.cells
  with check (
    auth.uid() = created_by
    and (
      cell_type <> 'image'
      or public.is_admin()
      or (
        select count(*) from public.cells c
        where c.created_by = auth.uid()
          and c.cell_type = 'image'
          and c.created_at >= date_trunc('day', now())
      ) < 5
    )
  );

-- v1.3: show who uploaded each cell. Derived server-side from the JWT at
-- insert time (not sent by the client), so it can't be spoofed. Falls back
-- from Google's display name to the email's local part (before "@") for
-- magic-link users, so the full email is never exposed. Existing rows
-- keep a null name — the UI just omits attribution for those.

alter table public.cells add column created_by_name text default (
  coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    split_part(auth.jwt() ->> 'email', '@', 1)
  )
);

-- v1.4: image themes. Pre-populated list users pick from when uploading;
-- admins manage the list from /admin (reachable via the gear icon, which
-- only shows for admin accounts). Removing an in-use theme just clears the
-- tag on those cells (on delete set null) rather than blocking the delete.

create table public.themes (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);
alter table public.themes enable row level security;

create policy "themes_select_public"
  on public.themes for select
  using (true);

create policy "themes_admin_insert"
  on public.themes for insert
  to authenticated
  with check (public.is_admin());

create policy "themes_admin_delete"
  on public.themes for delete
  to authenticated
  using (public.is_admin());

insert into public.themes (name) values
  ('Generic'),
  ('Sketch the Moment'),
  ('Basics'),
  ('Typography'),
  ('People poses'),
  ('Daily Objects');

alter table public.cells add column theme_id bigint references public.themes(id) on delete set null;

-- v1.5: per-user permissions (login / upload) for moderating abuse.
-- auth.users isn't queryable from the app, so we mirror it into a normal
-- public.profiles table via a trigger — the standard Supabase pattern for
-- this. can_upload is enforced by real RLS (unbypassable). can_login is an
-- app-level "soft ban": RLS can't block the sign-in handshake itself, so
-- src/proxy.ts checks this on every navigation and signs the user back out
-- immediately if false — see that file for the enforcement side.

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  can_login    boolean not null default true,
  can_upload   boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill everyone who signed up before this trigger existed.
insert into public.profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

alter policy "cells_insert_authenticated"
  on public.cells
  with check (
    auth.uid() = created_by
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_upload)
    and (
      cell_type <> 'image'
      or public.is_admin()
      or (
        select count(*) from public.cells c
        where c.created_by = auth.uid()
          and c.cell_type = 'image'
          and c.created_at >= date_trunc('day', now())
      ) < 5
    )
  );

alter policy "cells_images_authenticated_insert"
  on storage.objects
  with check (
    bucket_id = 'cells-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_upload)
  );

-- NOTE: an earlier "admins_select_admin" policy (using public.is_admin())
-- was removed here — it made admins' own RLS call is_admin(), which itself
-- queries admins, recursing infinitely until Postgres hit max_stack_depth
-- (error 54001). That broke every upload, since is_admin() is evaluated
-- via the can_upload check on many paths. Do not re-add a policy on
-- public.admins that calls is_admin() in its USING/WITH CHECK clause.

-- v1.6: let admins reset a user's daily image-upload counter without
-- touching their existing cells. The daily limit counts images created
-- since whichever is later: the start of today, or this timestamp — so
-- setting it to now() effectively zeroes the count for the rest of today.
alter table public.profiles add column upload_limit_reset_at timestamptz;

alter policy "cells_insert_authenticated"
  on public.cells
  with check (
    auth.uid() = created_by
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_upload)
    and (
      cell_type <> 'image'
      or public.is_admin()
      or (
        select count(*) from public.cells c
        where c.created_by = auth.uid()
          and c.cell_type = 'image'
          and c.created_at >= greatest(
            date_trunc('day', now()),
            coalesce(
              (select p.upload_limit_reset_at from public.profiles p where p.id = auth.uid()),
              '-infinity'::timestamptz
            )
          )
      ) < 5
    )
  );

-- v1.7: let any signed-in user add social/website links to their own
-- profile. Deliberately NOT a general self-update RLS policy — that would
-- let a user set can_login/can_upload on themselves too, since RLS can't
-- restrict which columns a row-level policy applies to. Instead, a
-- security-definer function scoped to only these three columns, called via
-- supabase.rpc(...), is the only way a user can touch their own row.
alter table public.profiles
  add column website_url text,
  add column instagram_handle text,
  add column twitter_handle text;

create or replace function public.update_my_social_links(
  p_website_url text,
  p_instagram_handle text,
  p_twitter_handle text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set website_url = p_website_url,
      instagram_handle = p_instagram_handle,
      twitter_handle = p_twitter_handle
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_social_links(text, text, text) to authenticated;

-- v1.8: let anyone viewing a sketch see its uploader's social/website
-- links — the whole point of adding them. Not a public SELECT policy on
-- profiles (that would also expose email/can_login/can_upload, which
-- RLS can't hide on a per-column basis); instead a security-definer
-- function that only ever returns these specific safe columns.
create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  display_name text,
  website_url text,
  instagram_handle text,
  twitter_handle text
)
language sql
stable
security definer
set search_path = public
as $$
  select display_name, website_url, instagram_handle, twitter_handle
  from public.profiles
  where id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- v1.9: one-time backfill for images uploaded before theme_id/
-- created_by_name existed on cells — give them a sensible default rather
-- than leaving them blank in the UI.
update public.cells
set theme_id = (select id from public.themes where name = 'Generic')
where cell_type = 'image' and theme_id is null;

update public.cells
set created_by_name = 'kumar ahir'
where cell_type = 'image' and created_by_name is null;

-- v2.0: let admins pick which theme is pre-selected in the upload dropdown.
-- The partial unique index guarantees at most one row is ever the default.
alter table public.themes add column is_default boolean not null default false;

create unique index themes_single_default_idx
  on public.themes (is_default)
  where is_default;

update public.themes set is_default = true where name = 'Generic';

-- Two statements, each with a real WHERE clause — Supabase blocks any
-- UPDATE with no WHERE clause at all (a safeguard against accidental
-- full-table writes), which a single `set is_default = (id = p_theme_id)`
-- statement tripped. Splitting it is also safe with respect to the unique
-- index above: each statement's end-state has at most one true row (zero
-- after the first, exactly one after the second), and uniqueness is only
-- checked at the end of each statement, not mid-statement.
create or replace function public.set_default_theme(p_theme_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.themes set is_default = false where is_default = true and id <> p_theme_id;
  update public.themes set is_default = true where id = p_theme_id;
end;
$$;

grant execute on function public.set_default_theme(bigint) to authenticated;

-- v2.1: upload streaks. current_streak/longest_streak/last_upload_date are
-- maintained entirely by the trigger below (never written to directly by
-- the client) so every image-insert path — including the admin bulk
-- uploader — updates them consistently without each call site having to
-- remember to. Reading your own streak needs no new policy: the existing
-- "profiles_select_self" policy already covers it.
alter table public.profiles
  add column current_streak integer not null default 0,
  add column longest_streak integer not null default 0,
  add column last_upload_date date,
  add column streak_reminder_sent_at timestamptz;

create or replace function public.bump_upload_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_date date;
  v_current integer;
  v_longest integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  if new.cell_type <> 'image' then
    return new;
  end if;

  select last_upload_date, current_streak, longest_streak
    into v_last_date, v_current, v_longest
    from public.profiles
    where id = new.created_by;

  if v_last_date = v_today then
    -- Already logged an upload today (e.g. a second image) — no change.
    return new;
  elsif v_last_date = v_today - 1 then
    v_current := v_current + 1;
  else
    -- Gap of 2+ days, or this is the user's first-ever upload.
    v_current := 1;
  end if;

  if v_longest is null or v_current > v_longest then
    v_longest := v_current;
  end if;

  update public.profiles
  set current_streak = v_current,
      longest_streak = v_longest,
      last_upload_date = v_today,
      -- Clears any past reminder flag so a future break can be reminded again.
      streak_reminder_sent_at = null
  where id = new.created_by;

  return new;
end;
$$;

drop trigger if exists on_cell_insert_bump_streak on public.cells;
create trigger on_cell_insert_bump_streak
  after insert on public.cells
  for each row execute function public.bump_upload_streak();

-- Reminder email cron support. A scheduled job has no logged-in user, so it
-- can't rely on auth.uid()/is_admin() the way every other RPC in this file
-- does. Instead these two functions gate on a shared secret passed as a
-- parameter — the same "shared secret" trust model already used by the
-- welcome-email webhook (see src/app/api/welcome-email/route.ts), just
-- expressed as a Postgres GUC instead of an HTTP header. Set the matching
-- value once via:
--   alter database postgres set app.cron_secret = 'some-long-random-string';
-- (must equal the CRON_SECRET env var used by src/app/api/streak-reminders).
-- Granted to anon since a cron job authenticates with no user session at
-- all — safe only because both functions independently reject any caller
-- that doesn't supply the exact matching secret.
create or replace function public.get_streak_reminder_candidates(p_secret text)
returns table (
  id uuid,
  email text,
  display_name text,
  current_streak integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_secret is null or p_secret <> current_setting('app.cron_secret', true) then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.email, p.display_name, p.current_streak
  from public.profiles p
  where p.current_streak > 0
    and p.last_upload_date < (current_date - 2)
    and p.streak_reminder_sent_at is null;
end;
$$;

grant execute on function public.get_streak_reminder_candidates(text) to anon, authenticated;

create or replace function public.mark_streak_reminders_sent(p_secret text, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret is null or p_secret <> current_setting('app.cron_secret', true) then
    raise exception 'not authorized';
  end if;

  update public.profiles
  set streak_reminder_sent_at = now()
  where id = any(p_user_ids);
end;
$$;

grant execute on function public.mark_streak_reminders_sent(text, uuid[]) to anon, authenticated;
