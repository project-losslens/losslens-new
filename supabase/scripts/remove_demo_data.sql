-- remove_demo_data.sql — delete sample Protection data seeded by
-- supabase/seed/protection_demo.sql. Run as postgres. Destructive — demo only.
delete from public.protection_events where is_demo or detail->>'note' like '%demo only%';
delete from public.protection_consents
  where membership_id in (select id from public.protection_memberships where member_reference like 'REF-%');
delete from public.protection_memberships where member_reference like 'REF-%';
delete from public.protection_plans where code = 'SAMPLE-WS';
delete from public.insurer_partnerships where cohort_name = 'Sample Cohort';
delete from public.insurers where name = 'Sample Health Assurance';
delete from public.therapists where license_number like 'LIC-SAMPLE-%';
-- verification: all counts should be 0
select
  (select count(*) from public.protection_memberships where member_reference like 'REF-%') as memberships,
  (select count(*) from public.insurers where name = 'Sample Health Assurance') as insurers,
  (select count(*) from public.therapists where license_number like 'LIC-SAMPLE-%') as therapists;
