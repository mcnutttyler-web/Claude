-- CardPick bin/block locations
-- Tracks the physical chaos-sort layout: 3200ct boxes divided into
-- sequential 100-card blocks, each labeled with the alphabetical name
-- range it holds. A block starts in 'staging' while its contents can
-- still shift (before a box is sealed) and becomes 'finalized' once the
-- range is locked in, per the stage-then-box workflow.

create table public.bin_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  box_number integer not null check (box_number > 0),
  block_number integer not null check (block_number > 0),
  start_name text not null,
  end_name text not null,
  card_count integer not null default 0 check (card_count >= 0),
  status text not null default 'staging' check (status in ('staging', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, block_number)
);

create index bin_locations_user_id_idx on public.bin_locations (user_id);
create index bin_locations_box_number_idx on public.bin_locations (box_number);

create trigger bin_locations_set_updated_at
  before update on public.bin_locations
  for each row
  execute function public.set_updated_at();

alter table public.collection_items
  add column location_id uuid references public.bin_locations (id) on delete set null;

create index collection_items_location_id_idx on public.collection_items (location_id);

alter table public.bin_locations enable row level security;

create policy "users manage their own bin locations"
  on public.bin_locations for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
