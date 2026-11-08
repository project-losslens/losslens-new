-- FN-08: drop legacy function signatures superseded by the RPC rewrites.
-- Frontend grep (2026-11-10): no remaining calls to
-- admin_assign_voucher(uuid,uuid) or supporter_invitation_lookup(text) in src/.

drop function if exists public.admin_assign_voucher(uuid, uuid);
drop function if exists public.supporter_invitation_lookup(text);

notify pgrst, 'reload schema';
