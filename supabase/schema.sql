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

create or replace function public.is_admin()
returns boolean
language sql
stable
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

-- Admins can also see the full admin list (not just their own row) so the
-- Users panel can tag admin accounts and avoid accidental self-lockout.
create policy "admins_select_admin"
  on public.admins for select
  to authenticated
  using (public.is_admin());

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
