-- grant_super_admin.sql — promote a user to super_admin by email.
-- Run in the Supabase SQL editor as postgres.

do $$
declare
  v_uid uuid;
  v_email text := 'admin@example.com'; -- << EDIT THIS
begin
  select id into v_uid from public.profiles where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No profile found for email %', v_email;
  end if;
  update public.profiles set is_super_admin = true where id = v_uid;
end $$;

-- Verification
select id, email, role, is_super_admin from public.profiles
where lower(email) = lower('admin@example.com');
