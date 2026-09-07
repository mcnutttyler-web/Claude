-- CardPick V1 foundation
-- Trading card collection tracker: catalog of known cards, a user's owned
-- copies, scan-based low-confidence match candidates, and a physical
-- recount ("audit") workflow that requires explicit confirmation before a
-- card is marked missing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- cards: shared reference catalog (not user-scoped). Populated from an
-- external card database lookup or manual entry. Regular users can read
-- it but cannot write to it directly from the client; new catalog rows
-- are inserted by trusted server-side code (service role) when a scan
-- lookup finds a card that isn't in the catalog yet.
-- ---------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual' check (source in ('manual', 'scan_lookup')),
  external_id text,
  name text not null,
  set_name text,
  set_code text,
  card_number text,
  variant text,
  image_url text,
  created_at timestamptz not null default now()
);

create unique index cards_source_external_id_key
  on public.cards (source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------
-- collection_items: a card a user owns (or a placeholder for one they
-- haven't identified yet). quantity is the absolute count the user
-- currently believes they have -- audits compare against this number,
-- they never accumulate deltas.
-- ---------------------------------------------------------------------
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid references public.cards (id) on delete set null,
  placeholder_label text,
  quantity integer not null default 1 check (quantity >= 0),
  condition text,
  added_via text not null default 'manual' check (added_via in ('manual', 'scan')),
  status text not null default 'active'
    check (status in ('active', 'needs_review', 'confirmed_missing')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_items_identity_check
    check (card_id is not null or placeholder_label is not null)
);

create index collection_items_user_id_idx on public.collection_items (user_id);
create index collection_items_card_id_idx on public.collection_items (card_id);
create index collection_items_status_idx on public.collection_items (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger collection_items_set_updated_at
  before update on public.collection_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- scan_candidates: low-confidence catalog matches offered for a
-- collection_item that came from a scan lookup. A human picks one (or
-- none), which resolves the item out of 'needs_review'.
-- ---------------------------------------------------------------------
create table public.scan_candidates (
  id uuid primary key default gen_random_uuid(),
  collection_item_id uuid not null references public.collection_items (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  rank smallint not null default 1,
  created_at timestamptz not null default now()
);

create index scan_candidates_collection_item_id_idx
  on public.scan_candidates (collection_item_id);

-- ---------------------------------------------------------------------
-- audits: one physical recount session.
-- ---------------------------------------------------------------------
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index audits_user_id_idx on public.audits (user_id);

-- ---------------------------------------------------------------------
-- audit_counts: per-card absolute counts within an audit. expected_count
-- is a snapshot of collection_items.quantity taken when the audit line
-- is created; counted_count is the absolute number the user physically
-- counted. A mismatch is only ever proposed (mismatch_pending_review) --
-- it never auto-flips a card to confirmed_missing. That requires an
-- explicit call to confirm_audit_missing below.
-- ---------------------------------------------------------------------
create table public.audit_counts (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  collection_item_id uuid not null references public.collection_items (id) on delete cascade,
  expected_count integer not null check (expected_count >= 0),
  counted_count integer check (counted_count >= 0),
  status text not null default 'pending'
    check (status in (
      'pending', 'matched', 'mismatch_pending_review',
      'confirmed_missing', 'adjusted', 'dismissed'
    )),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  notes text,
  created_at timestamptz not null default now(),
  unique (audit_id, collection_item_id)
);

create index audit_counts_audit_id_idx on public.audit_counts (audit_id);
create index audit_counts_collection_item_id_idx on public.audit_counts (collection_item_id);

-- Auto-classify as soon as a count is entered, but only as far as
-- "needs a human" -- never straight to confirmed_missing.
create or replace function public.classify_audit_count()
returns trigger
language plpgsql
as $$
begin
  if new.counted_count is null then
    new.status := 'pending';
  elsif new.counted_count = new.expected_count then
    new.status := 'matched';
  elsif new.status = 'pending' or new.status = 'matched' then
    new.status := 'mismatch_pending_review';
  end if;
  return new;
end;
$$;

create trigger audit_counts_classify
  before insert or update of counted_count on public.audit_counts
  for each row
  execute function public.classify_audit_count();

-- ---------------------------------------------------------------------
-- Resolution actions. Both run as the calling user (RLS-checked, not
-- security definer) and touch audit_counts + collection_items together
-- so a card can never end up marked missing without a matching,
-- reviewed audit_counts row.
-- ---------------------------------------------------------------------
create or replace function public.confirm_audit_missing(p_audit_count_id uuid)
returns void
language plpgsql
as $$
declare
  v_collection_item_id uuid;
begin
  update public.audit_counts
  set status = 'confirmed_missing',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_audit_count_id
    and status = 'mismatch_pending_review'
  returning collection_item_id into v_collection_item_id;

  if v_collection_item_id is null then
    raise exception 'audit_counts row % not found or not in mismatch_pending_review', p_audit_count_id;
  end if;

  update public.collection_items
  set status = 'confirmed_missing'
  where id = v_collection_item_id;
end;
$$;

create or replace function public.adjust_audit_count(p_audit_count_id uuid)
returns void
language plpgsql
as $$
declare
  v_collection_item_id uuid;
  v_counted_count integer;
begin
  update public.audit_counts
  set status = 'adjusted',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_audit_count_id
    and status = 'mismatch_pending_review'
  returning collection_item_id, counted_count into v_collection_item_id, v_counted_count;

  if v_collection_item_id is null then
    raise exception 'audit_counts row % not found or not in mismatch_pending_review', p_audit_count_id;
  end if;

  update public.collection_items
  set quantity = v_counted_count
  where id = v_collection_item_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.cards enable row level security;
alter table public.collection_items enable row level security;
alter table public.scan_candidates enable row level security;
alter table public.audits enable row level security;
alter table public.audit_counts enable row level security;

create policy "cards readable by authenticated users"
  on public.cards for select
  to authenticated
  using (true);

create policy "users manage their own collection items"
  on public.collection_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage scan candidates for their own items"
  on public.scan_candidates for all
  to authenticated
  using (
    exists (
      select 1 from public.collection_items ci
      where ci.id = scan_candidates.collection_item_id
        and ci.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collection_items ci
      where ci.id = scan_candidates.collection_item_id
        and ci.user_id = auth.uid()
    )
  );

create policy "users manage their own audits"
  on public.audits for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage audit counts for their own audits"
  on public.audit_counts for all
  to authenticated
  using (
    exists (
      select 1 from public.audits a
      where a.id = audit_counts.audit_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.audits a
      where a.id = audit_counts.audit_id
        and a.user_id = auth.uid()
    )
  );
