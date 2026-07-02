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
