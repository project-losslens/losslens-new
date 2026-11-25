begin;

alter table public.support_tickets
  alter column user_id drop not null,
  add column ticket_number bigint generated always as identity unique,
  add column guest_email text,
  add column guest_message text,
  add constraint support_ticket_submitter_check check (
    (user_id is not null and guest_email is null and guest_message is null)
    or (user_id is null and guest_email is not null and guest_message is not null)
  );

create index support_tickets_guest_created_idx
  on public.support_tickets (created_at desc) where user_id is null;

create function public.support_submit_request(
  p_subject text, p_category text, p_body text, p_email text default null
) returns text language plpgsql security definer set search_path = ''
as $$
declare
  request_id uuid;
  reference_number bigint;
  email_address text := lower(btrim(p_email));
begin
  if auth.uid() is not null then
    request_id := public.support_submit_ticket(p_subject, p_category, p_body);
    select ticket_number into reference_number from public.support_tickets where id = request_id;
  else
    if p_subject is null or length(btrim(p_subject)) not between 3 and 160
       or p_body is null or length(btrim(p_body)) not between 1 and 4000
       or p_category is null or p_category not in ('account','technical','billing','protection','other')
       or email_address is null or length(email_address) > 254
       or email_address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Enter a valid email, subject and message';
    end if;

    perform pg_advisory_xact_lock(hashtext('losslens:support-guest-intake'));
    if (select count(*) from public.support_tickets
          where user_id is null and created_at > now() - interval '1 hour') >= 60
       or (select count(*) from public.support_tickets
          where user_id is null and guest_email = email_address and created_at > now() - interval '1 hour') >= 3 then
      raise exception 'Too many requests. Please try again later.';
    end if;

    insert into public.support_tickets (subject, category, guest_email, guest_message)
    values (btrim(p_subject), p_category, email_address, btrim(p_body))
    returning ticket_number into reference_number;
  end if;
  return 'LL-' || reference_number::text;
end;
$$;

create function public.support_request_list(p_staff boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  requests jsonb;
begin
  if viewer_id is null or not coalesce(public.is_active_user(), false) then
    raise exception 'Active account required';
  end if;
  if p_staff and not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required';
  end if;

  select coalesce(jsonb_agg(request.data order by request.updated_at desc, request.id desc), '[]'::jsonb)
    into requests
    from (
      select ticket.id, ticket.updated_at, jsonb_build_object(
        'id', ticket.id,
        'reference', 'LL-' || ticket.ticket_number::text,
        'subject', ticket.subject,
        'category', ticket.category,
        'status', ticket.status,
        'created_at', ticket.created_at,
        'updated_at', ticket.updated_at
      ) || case when p_staff then jsonb_build_object(
        'user_id', ticket.user_id,
        'guest_email', ticket.guest_email,
        'message', coalesce(ticket.guest_message, (
          select message.body from public.support_ticket_messages as message
          where message.ticket_id = ticket.id and message.sender_id = ticket.user_id
          order by message.created_at, message.id limit 1
        ))
      ) else '{}'::jsonb end as data
      from public.support_tickets as ticket
      where p_staff or ticket.user_id = viewer_id
      order by ticket.updated_at desc, ticket.id desc
      limit 100
    ) as request;
  return requests;
end;
$$;

revoke all on function public.support_submit_request(text,text,text,text) from public, anon, authenticated;
revoke all on function public.support_request_list(boolean) from public, anon, authenticated;
grant execute on function public.support_submit_request(text,text,text,text) to anon, authenticated;
grant execute on function public.support_request_list(boolean) to authenticated;

commit;
