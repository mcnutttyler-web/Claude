-- Remove the in-app audit-count workflow.
-- Physical audits now happen outside CardPick before a card is ever
-- entered; the app's job is only to assign a bin location (or mark a
-- card missing directly). The expected/counted mismatch machinery is
-- no longer needed -- collection_items.status already supports
-- 'confirmed_missing' as a plain, direct update.

drop table if exists public.audit_counts cascade;
drop table if exists public.audits cascade;

drop function if exists public.confirm_audit_missing(uuid);
drop function if exists public.adjust_audit_count(uuid);
drop function if exists public.classify_audit_count();
