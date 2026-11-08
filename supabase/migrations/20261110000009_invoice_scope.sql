-- FN-10: bulk invoices must include insurer-approved claims that the platform
-- has already paid the therapist for (status 'paid'), in addition to 'approved'.
-- Money model is unchanged: insurer payment still flows through
-- insurer_reimburse_bulk / admin_confirm_invoice_payment only.

create or replace function public.insurer_generate_bulk_invoice(
  p_insurer_id uuid, p_period_start date, p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can generate invoices'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Invalid invoice period';
  end if;
  select id into v_invoice_id from public.bulk_invoices
  where insurer_id = p_insurer_id and invoice_period_start = p_period_start and invoice_period_end = p_period_end
  for update;
  if v_invoice_id is null then
    insert into public.bulk_invoices (insurer_id, invoice_period_start, invoice_period_end)
    values (p_insurer_id, p_period_start, p_period_end)
    returning id into v_invoice_id;
  elsif (select status from public.bulk_invoices where id = v_invoice_id) <> 'draft' then
    raise exception 'This period already has a finalized invoice';
  end if;

  insert into public.bulk_invoice_claims (invoice_id, claim_id)
  select v_invoice_id, s.id
  from public.claim_submissions s
  join public.provider_claims c on c.id = s.claim_id
  where s.insurer_id = p_insurer_id
    and s.insurer_status = 'approved'
    and c.status in ('approved', 'paid')
    and c.insurer_reimbursed_at is null
    and c.session_date between p_period_start and p_period_end
    and not exists (select 1 from public.bulk_invoice_claims bic where bic.claim_id = s.id)
  on conflict do nothing;

  update public.bulk_invoices i
  set total_claims = counts.claim_count, total_amount = counts.total_amount
  from (
    select count(*)::integer as claim_count, coalesce(sum(c.claim_amount), 0)::numeric(14,2) as total_amount
    from public.bulk_invoice_claims bic
    join public.claim_submissions s on s.id = bic.claim_id
    join public.provider_claims c on c.id = s.claim_id
    where bic.invoice_id = v_invoice_id
  ) counts
  where i.id = v_invoice_id;
  return v_invoice_id;
end;
$$;

revoke execute on function public.insurer_generate_bulk_invoice(uuid, date, date) from public, anon;
grant execute on function public.insurer_generate_bulk_invoice(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
