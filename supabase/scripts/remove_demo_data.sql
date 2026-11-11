-- remove_demo_data.sql — delete ALL is_demo rows created by protection_demo.sql
-- (and any other is_demo fixture data). Run as postgres. Destructive — demo only.
delete from public.protection_events where is_demo;
delete from public.protection_consents where membership_id in (select id from public.protection_memberships where is_demo);
delete from public.protection_memberships where is_demo;
delete from public.protection_plans where name like 'Sample%';
delete from public.insurer_partnerships where terms->>'note' like '%demo only%';
delete from public.insurers where company_name like 'Sample%';
delete from public.therapists where bio like '%demo only%';
-- verification
select 'demo rows remaining' as check, (
  (select count(*) from public.protection_memberships where is_demo) +
  (select count(*) from public.protection_events where is_demo) +
  (select count(*) from public.therapists where bio like '%demo only%')
) as remaining;
