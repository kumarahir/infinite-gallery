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
