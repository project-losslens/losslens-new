-- Quick check-in: self-rated urge level 0-10 on diary entries.
alter table public.diary_entries add column if not exists urge_level smallint;
alter table public.diary_entries drop constraint if exists diary_entries_urge_level_check;
alter table public.diary_entries add constraint diary_entries_urge_level_check
  check (urge_level is null or (urge_level >= 0 and urge_level <= 10));
