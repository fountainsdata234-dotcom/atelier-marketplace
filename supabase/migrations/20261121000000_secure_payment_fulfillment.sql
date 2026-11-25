begin;

alter table public.premium_payments enable row level security;
alter table public.collection_slot_payments enable row level security;

revoke all on table public.premium_payments, public.collection_slot_payments
  from public, anon, authenticated;
grant all on table public.premium_payments, public.collection_slot_payments
  to service_role;

create or replace function public.activate_collection_slot_payment(
  p_reference text,
  p_provider_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.collection_slot_payments%rowtype;
  v_slots integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for collection slot fulfillment' using errcode = '42501';
  end if;

  if nullif(btrim(p_reference), '') is null then
    raise exception 'A payment reference is required' using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.collection_slot_payments
  where reference = p_reference
  for update;

  if not found then
    raise exception 'Collection slot payment does not exist' using errcode = 'P0002';
  end if;

  select collection_slots_purchased
  into v_slots
  from public.profiles
  where id = v_payment.user_id
  for update;

  if not found then
    raise exception 'Collection slot owner profile does not exist' using errcode = 'P0002';
  end if;

  if v_payment.status in ('successful', 'refunded') then
    return v_slots;
  end if;

  update public.profiles
  set collection_slots_purchased = least(28, v_slots + 1),
      updated_at = now()
  where id = v_payment.user_id
  returning collection_slots_purchased into v_slots;

  update public.collection_slot_payments
  set status = 'successful',
      provider_data = coalesce(p_provider_data, '{}'::jsonb),
      updated_at = now()
  where id = v_payment.id;

  return v_slots;
end;
$$;

revoke all on function public.activate_collection_slot_payment(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.activate_collection_slot_payment(text, jsonb)
  to service_role;

commit;
