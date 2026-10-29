begin;

alter table public.profiles
  add column if not exists business_latitude double precision,
  add column if not exists business_longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_status text not null default 'needs_setup',
  add column if not exists location_confirmed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_business_coordinates_pair_check,
  drop constraint if exists profiles_business_latitude_check,
  drop constraint if exists profiles_business_longitude_check,
  drop constraint if exists profiles_location_accuracy_check,
  drop constraint if exists profiles_location_status_check,
  add constraint profiles_business_coordinates_pair_check
    check ((business_latitude is null) = (business_longitude is null)),
  add constraint profiles_business_latitude_check
    check (business_latitude is null or business_latitude between -90 and 90),
  add constraint profiles_business_longitude_check
    check (business_longitude is null or business_longitude between -180 and 180),
  add constraint profiles_location_accuracy_check
    check (location_accuracy_m is null or location_accuracy_m between 0 and 5000),
  add constraint profiles_location_status_check
    check (location_status in ('needs_setup', 'needs_confirmation', 'seller_confirmed'));

update public.profiles
set
  business_latitude = case
    when coalesce(location->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (location->>'lat')::double precision between -90 and 90
    then (location->>'lat')::double precision
    else null
  end,
  business_longitude = case
    when coalesce(location->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (location->>'lng')::double precision between -180 and 180
    then (location->>'lng')::double precision
    else null
  end,
  location_accuracy_m = case
    when coalesce(location->>'accuracyMeters', '') ~ '^[0-9]+(\.[0-9]+)?$'
      and (location->>'accuracyMeters')::double precision between 0 and 5000
    then (location->>'accuracyMeters')::double precision
    else null
  end,
  location_status = case
    when coalesce(location->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (location->>'lat')::double precision between -90 and 90
      and coalesce(location->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (location->>'lng')::double precision between -180 and 180
    then 'needs_confirmation'
    else 'needs_setup'
  end,
  location_confirmed_at = null,
  location = location - 'lat' - 'lng' - 'accuracyMeters' - 'verificationStatus' - 'locationSource' - 'confirmedAt'
where role in ('tailor', 'fabric_seller');

create index if not exists profiles_confirmed_seller_location_latitude_idx
  on public.profiles (business_latitude)
  where role in ('tailor', 'fabric_seller')
    and not is_blocked
    and location_status = 'seller_confirmed'
    and business_latitude is not null;

create or replace function public.find_nearby_sellers(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision
)
returns table (seller_id uuid, distance_km double precision)
language sql
stable
set search_path = public
as $$
  with candidates as (
    select
      profile.id,
      6371.0088 * 2 * asin(sqrt(least(1::double precision,
        power(sin(radians(profile.business_latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(profile.business_latitude))
          * power(sin(radians(profile.business_longitude - p_longitude) / 2), 2)
      ))) as distance_km
    from public.profiles profile
    where profile.role in ('tailor', 'fabric_seller')
      and not profile.is_blocked
      and profile.location_status = 'seller_confirmed'
      and profile.business_latitude between
        greatest(-90::double precision, p_latitude - p_radius_km / 110.574)
        and least(90::double precision, p_latitude + p_radius_km / 110.574)
  )
  select candidates.id, candidates.distance_km
  from candidates
  where candidates.distance_km <= p_radius_km
  order by candidates.distance_km asc, candidates.id asc
  limit 500;
$$;

revoke all on function public.find_nearby_sellers(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.find_nearby_sellers(double precision, double precision, double precision) to service_role;

create or replace function public.sync_seller_profile_from_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('tailor', 'fabric_seller') then
    insert into public.seller_profiles (
      user_id, seller_type, business_name, public_location, is_active
    ) values (
      new.id, new.role, coalesce(new.shop_name, ''),
      jsonb_strip_nulls(jsonb_build_object(
        'city', nullif(new.location->>'city', ''),
        'state', nullif(new.location->>'state', ''),
        'country', nullif(new.location->>'country', ''),
        'countryCode', nullif(new.location->>'countryCode', ''),
        'lat', case when new.location_status = 'seller_confirmed' then new.business_latitude end,
        'lng', case when new.location_status = 'seller_confirmed' then new.business_longitude end,
        'businessAddress', case when new.location_status = 'seller_confirmed' then nullif(new.location->>'businessAddress', '') end,
        'verificationStatus', case when new.location_status = 'seller_confirmed' then 'seller_confirmed' end
      )),
      not coalesce(new.is_blocked, false)
    )
    on conflict (user_id) do update set
      seller_type = excluded.seller_type,
      business_name = excluded.business_name,
      public_location = excluded.public_location,
      is_active = excluded.is_active,
      updated_at = now();
  else
    update public.seller_profiles
    set is_active = false, updated_at = now()
    where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_seller_profile on public.profiles;
create trigger profiles_sync_seller_profile
after insert or update of role, shop_name, location, is_blocked, business_latitude, business_longitude, location_status
on public.profiles
for each row execute function public.sync_seller_profile_from_user();

commit;
