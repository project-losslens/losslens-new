alter table public.profiles
  add column if not exists daily_risk_score integer not null default 0,
  add column if not exists risk_factors jsonb not null default '[]'::jsonb,
  add column if not exists last_risk_check date;

notify pgrst, 'reload schema';
