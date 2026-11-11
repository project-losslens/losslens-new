-- protection_demo.sql — sample Protection data for pilot testing.
-- Requires demo auth users to exist first (created via the app or auth admin):
--   demo-insurer@example.com  (role='insurer')
--   demo-therapist1..3@example.com (role='therapist')
--   demo-member1..10@example.com  (role='user')
-- Remove everything with supabase/scripts/remove_demo_data.sql.
-- Run in the Supabase SQL editor as postgres.

insert into public.insurers (profile_id, name, contact_email, status)
select p.id, 'Sample Health Assurance', 'demo-insurer@example.com', 'active'
from public.profiles p where p.email = 'demo-insurer@example.com'
on conflict (profile_id) do nothing;

insert into public.insurer_partnerships (insurer_id, cohort_name, contract_start, member_count, status)
select i.id, 'Sample Cohort', current_date, 10, 'active'
from public.insurers i where i.name = 'Sample Health Assurance'
on conflict do nothing;

insert into public.protection_plans (insurer_id, name, code, benefits, limits)
select i.id, 'Sample Wellness Plan', 'SAMPLE-WS',
  '{"therapy_sessions":6,"telehealth":true}'::jsonb,
  '{"max_claim_kes":50000,"sessions_per_year":6}'::jsonb
from public.insurers i where i.name = 'Sample Health Assurance';

-- 3 sample therapists across verification states
insert into public.therapists (id, license_number, specialty, languages, bio, status, verified_at)
select p.id, 'LIC-SAMPLE-' || row_number() over (), 'CBT', '{"en","sw"}', 'Sample therapist — demo only', st,
       case when st = 'active' then now() else null end
from public.profiles p
cross join (values ('active'),('active'),('pending')) v(st)
where p.email like 'demo-therapist%@example.com'
on conflict (id) do nothing;

-- 10 sample memberships across all statuses
insert into public.protection_memberships (user_id, insurer_id, plan_id, member_reference, status)
select p.id, i.id, pl.id, 'REF-' || upper(substr(p.id::text,1,6)), st
from public.profiles p
cross join (values ('pending_verification'),('active'),('active'),('active'),('suspended'),('ended'),('rejected'),('pending_verification'),('active'),('ended')) v(st)
cross join public.insurers i
cross join public.protection_plans pl
where i.name = 'Sample Health Assurance'
  and pl.code = 'SAMPLE-WS'
  and p.email like 'demo-member%@example.com'
on conflict (user_id, insurer_id) do nothing;

-- Default consent rows for the seeded memberships
insert into public.protection_consents (membership_id, scope, granted)
select m.id, s.scope, (m.status = 'active' and s.scope = 'status_updates')
from public.protection_memberships m
cross join (values ('status_updates'),('session_summaries'),('billing_contact')) s(scope)
where m.member_reference like 'REF-%'
on conflict (membership_id, scope) do nothing;

-- Sample protection events
insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail, is_demo)
select m.id, m.insurer_id, null, 'demo_seed', '{"note":"Sample event — demo only"}'::jsonb, true
from public.protection_memberships m
where m.member_reference like 'REF-%'
on conflict do nothing;

-- verification
select status, count(*) from public.protection_memberships group by status order by status;
