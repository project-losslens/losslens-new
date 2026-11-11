-- protection_demo.sql — sample Protection data for pilot testing.
-- EVERYTHING here is is_demo=true and labelled Sample. Run only in a demo
-- database; remove with supabase/scripts/remove_demo_data.sql.
-- Run in the Supabase SQL editor as postgres.

-- Sample insurer (portal login is a normal auth user with role='insurer';
-- create that user via the app first, then set insurers.user_id below).
insert into public.insurers (company_name, contact_email, status, user_id)
select 'Sample Health Assurance', 'demo-insurer@example.com', 'active', p.id
from public.profiles p
where p.email = 'demo-insurer@example.com'
on conflict do nothing;

insert into public.insurer_partnerships (insurer_id, status, terms)
select i.id, 'active', '{"note":"Sample partnership — demo only"}'::jsonb
from public.insurers i where i.company_name = 'Sample Health Assurance'
on conflict do nothing;

-- Sample plan
insert into public.protection_plans (insurer_id, name, code, benefits, limits)
select i.id, 'Sample Wellness Plan', 'SAMPLE-WS',
  '{"therapy_sessions":6,"telehealth":true}'::jsonb,
  '{"max_claim_kes":50000,"sessions_per_year":6}'::jsonb
from public.insurers i where i.company_name = 'Sample Health Assurance'
on conflict do nothing;

-- 3 sample therapists (pending/active/suspended coverage)
insert into public.therapists (id, license_number, specialty, languages, bio, status, is_demo)
select p.id, 'LIC-SAMPLE-' || row_number() over (), 'CBT', '{"en","sw"}', 'Sample therapist — demo only', st, true
from public.profiles p
cross join (values ('active'),('active'),('pending')) v(st)
where p.email like 'demo-therapist%@example.com'
on conflict (id) do nothing;

-- 10 sample memberships across all statuses
insert into public.protection_memberships (user_id, insurer_id, plan_id, member_reference, status, is_demo)
select p.id, i.id, pl.id, 'REF-' || upper(substr(p.id::text,1,6)), st, true
from public.profiles p
cross join (values ('pending_verification'),('active'),('active'),('active'),('suspended'),('ended'),('rejected'),('pending_verification'),('active'),('ended')) v(st)
cross join public.insurers i
cross join public.protection_plans pl
where i.company_name = 'Sample Health Assurance'
  and pl.code = 'SAMPLE-WS'
  and p.email like 'demo-member%@example.com'
on conflict (user_id, insurer_id) do nothing;

-- Sample protection events
insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail, is_demo)
select m.id, m.insurer_id, null, 'demo_seed', '{"note":"Sample event — demo only"}'::jsonb, true
from public.protection_memberships m
where m.is_demo
on conflict do nothing;
