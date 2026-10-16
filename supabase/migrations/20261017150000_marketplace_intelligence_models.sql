begin;

create table if not exists public.seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seller_type text not null check (seller_type in ('tailor', 'fabric_seller')),
  business_name text not null default '',
  public_location jsonb not null default '{}'::jsonb check (jsonb_typeof(public_location) = 'object'),
  specializations text[] not null default array[]::text[],
  is_public boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_profiles_discovery_idx
  on public.seller_profiles (seller_type, is_public, is_active, user_id);
create index if not exists seller_profiles_specializations_idx
  on public.seller_profiles using gin (specializations);
create index if not exists profiles_public_location_idx
  on public.profiles using gin (location jsonb_path_ops);
create index if not exists posts_listing_type_category_published_idx
  on public.posts (listing_type, category_id, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved'
    and deleted_at is null and not is_blocked;

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
        'countryCode', nullif(new.location->>'countryCode', '')
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
after insert or update of role, shop_name, location, is_blocked
on public.profiles
for each row execute function public.sync_seller_profile_from_user();

insert into public.seller_profiles (user_id, seller_type, business_name, public_location, is_active)
select
  profile.id,
  profile.role,
  coalesce(profile.shop_name, ''),
  jsonb_strip_nulls(jsonb_build_object(
    'city', nullif(profile.location->>'city', ''),
    'state', nullif(profile.location->>'state', ''),
    'country', nullif(profile.location->>'country', ''),
    'countryCode', nullif(profile.location->>'countryCode', '')
  )),
  not coalesce(profile.is_blocked, false)
from public.profiles profile
where profile.role in ('tailor', 'fabric_seller')
on conflict (user_id) do nothing;

alter table public.seller_profiles enable row level security;
revoke all on public.seller_profiles from public, anon, authenticated;
grant all on public.seller_profiles to service_role;

create table if not exists public.clothing_details (
  listing_id uuid primary key references public.posts(id) on delete cascade,
  garment_type text not null default '',
  gender text not null default '',
  sizes text[] not null default array[]::text[],
  customization_options text[] not null default array[]::text[],
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  fulfilment text check (fulfilment is null or fulfilment in ('ready_made', 'made_to_order')),
  updated_at timestamptz not null default now()
);

create index if not exists clothing_details_garment_type_idx on public.clothing_details (lower(garment_type));
create index if not exists clothing_details_sizes_idx on public.clothing_details using gin (sizes);
create index if not exists clothing_details_fulfilment_idx on public.clothing_details (fulfilment);

create table if not exists public.fabric_details (
  listing_id uuid primary key references public.posts(id) on delete cascade,
  material text not null default '',
  colour text not null default '',
  pattern text not null default '',
  width numeric(10, 2) check (width is null or width > 0),
  width_unit text check (width_unit is null or width_unit in ('cm', 'in')),
  price_unit text check (price_unit is null or price_unit in ('yard', 'metre', 'piece', 'roll')),
  available_quantity numeric(18, 3) check (available_quantity is null or available_quantity >= 0),
  minimum_order numeric(18, 3) check (minimum_order is null or minimum_order > 0),
  updated_at timestamptz not null default now()
);

create index if not exists fabric_details_material_idx on public.fabric_details (lower(material));
create index if not exists fabric_details_colour_idx on public.fabric_details (lower(colour));
create index if not exists fabric_details_pattern_idx on public.fabric_details (lower(pattern));
create index if not exists fabric_details_unit_idx on public.fabric_details (price_unit);

create or replace function public.sync_listing_type_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  details jsonb := coalesce(new.listing_details, '{}'::jsonb);
begin
  if new.listing_type = 'FABRIC' then
    delete from public.clothing_details where listing_id = new.id;
    insert into public.fabric_details (
      listing_id, material, colour, pattern, width, width_unit, price_unit,
      available_quantity, minimum_order, updated_at
    ) values (
      new.id,
      coalesce(details->>'material', ''),
      coalesce(details->>'colour', ''),
      coalesce(details->>'pattern', ''),
      case when details->>'width' ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
        case when (details->>'width')::numeric > 0
          then (details->>'width')::numeric else null end
        else null end,
      case when details->>'widthUnit' in ('cm', 'in') then details->>'widthUnit' else null end,
      case when details->>'priceUnit' in ('yard', 'metre', 'piece', 'roll')
        then details->>'priceUnit' else null end,
      new.stock_quantity,
      case when details->>'minimumOrder' ~ '^[0-9]{1,15}(\.[0-9]{1,3})?$' then
        case when (details->>'minimumOrder')::numeric > 0
          then (details->>'minimumOrder')::numeric else null end
        else null end,
      now()
    )
    on conflict (listing_id) do update set
      material = excluded.material,
      colour = excluded.colour,
      pattern = excluded.pattern,
      width = excluded.width,
      width_unit = excluded.width_unit,
      price_unit = excluded.price_unit,
      available_quantity = excluded.available_quantity,
      minimum_order = excluded.minimum_order,
      updated_at = now();
  elsif new.listing_type = 'CLOTHING' then
    delete from public.fabric_details where listing_id = new.id;
    insert into public.clothing_details (
      listing_id, garment_type, gender, sizes, customization_options,
      lead_time_days, fulfilment, updated_at
    ) values (
      new.id,
      coalesce(details->>'garmentType', ''),
      coalesce(details->>'gender', ''),
      case when jsonb_typeof(details->'sizes') = 'array'
        then array(select jsonb_array_elements_text(details->'sizes')) else array[]::text[] end,
      case when jsonb_typeof(details->'customizationOptions') = 'array'
        then array(select jsonb_array_elements_text(details->'customizationOptions')) else array[]::text[] end,
      case when details->>'leadTimeDays' ~ '^[0-9]{1,3}$' then
        case when (details->>'leadTimeDays')::integer <= 365
          then (details->>'leadTimeDays')::integer else null end
        else null end,
      case when details->>'fulfilment' in ('ready_made', 'made_to_order')
        then details->>'fulfilment' else null end,
      now()
    )
    on conflict (listing_id) do update set
      garment_type = excluded.garment_type,
      gender = excluded.gender,
      sizes = excluded.sizes,
      customization_options = excluded.customization_options,
      lead_time_days = excluded.lead_time_days,
      fulfilment = excluded.fulfilment,
      updated_at = now();
  else
    delete from public.clothing_details where listing_id = new.id;
    delete from public.fabric_details where listing_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_sync_type_details on public.posts;
create trigger posts_sync_type_details
after insert or update of listing_type, listing_details, stock_quantity
on public.posts
for each row execute function public.sync_listing_type_details();

insert into public.clothing_details (
  listing_id, garment_type, gender, sizes, customization_options, lead_time_days, fulfilment
)
select
  post.id,
  coalesce(post.listing_details->>'garmentType', ''),
  coalesce(post.listing_details->>'gender', ''),
  case when jsonb_typeof(post.listing_details->'sizes') = 'array'
    then array(select jsonb_array_elements_text(post.listing_details->'sizes')) else array[]::text[] end,
  case when jsonb_typeof(post.listing_details->'customizationOptions') = 'array'
    then array(select jsonb_array_elements_text(post.listing_details->'customizationOptions')) else array[]::text[] end,
  case when post.listing_details->>'leadTimeDays' ~ '^[0-9]{1,3}$' then
    case when (post.listing_details->>'leadTimeDays')::integer <= 365
      then (post.listing_details->>'leadTimeDays')::integer else null end
    else null end,
  case when post.listing_details->>'fulfilment' in ('ready_made', 'made_to_order')
    then post.listing_details->>'fulfilment' else null end
from public.posts post
where post.listing_type = 'CLOTHING'
on conflict (listing_id) do nothing;

insert into public.fabric_details (
  listing_id, material, colour, pattern, width, width_unit, price_unit, available_quantity, minimum_order
)
select
  post.id,
  coalesce(post.listing_details->>'material', ''),
  coalesce(post.listing_details->>'colour', ''),
  coalesce(post.listing_details->>'pattern', ''),
  case when post.listing_details->>'width' ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
    case when (post.listing_details->>'width')::numeric > 0
      then (post.listing_details->>'width')::numeric else null end
    else null end,
  case when post.listing_details->>'widthUnit' in ('cm', 'in')
    then post.listing_details->>'widthUnit' else null end,
  case when post.listing_details->>'priceUnit' in ('yard', 'metre', 'piece', 'roll')
    then post.listing_details->>'priceUnit' else null end,
  post.stock_quantity,
  case when post.listing_details->>'minimumOrder' ~ '^[0-9]{1,15}(\.[0-9]{1,3})?$' then
    case when (post.listing_details->>'minimumOrder')::numeric > 0
      then (post.listing_details->>'minimumOrder')::numeric else null end
    else null end
from public.posts post
where post.listing_type = 'FABRIC'
on conflict (listing_id) do nothing;

alter table public.clothing_details enable row level security;
alter table public.fabric_details enable row level security;
revoke all on public.clothing_details, public.fabric_details from public, anon, authenticated;
grant all on public.clothing_details, public.fabric_details to service_role;

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.posts(id) on delete cascade,
  storage_key text,
  source_url text,
  thumbnail_url text,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  position integer not null check (position >= 0),
  moderation_status text not null default 'approved' check (moderation_status in ('pending', 'approved', 'rejected')),
  alternate_view text not null default '',
  alt_text text not null default '',
  created_at timestamptz not null default now(),
  unique (listing_id, position),
  check (storage_key is not null or source_url is not null)
);

create index if not exists listing_media_listing_position_idx on public.listing_media (listing_id, position);
create index if not exists listing_media_moderation_idx on public.listing_media (moderation_status, created_at desc);

create or replace function public.sync_listing_media_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset jsonb;
  asset_position integer := 0;
  media_moderation_status text;
begin
  media_moderation_status := case new.moderation_status
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    else 'pending'
  end;
  if jsonb_typeof(coalesce(new.image_assets, '[]'::jsonb)) = 'array'
    and jsonb_array_length(new.image_assets) > 0 then
    for asset in select value from jsonb_array_elements(new.image_assets)
    loop
      if nullif(asset->>'storageKey', '') is not null or nullif(asset->>'url', '') is not null then
        insert into public.listing_media (
          listing_id, storage_key, source_url, thumbnail_url, media_type,
          width, height, position, moderation_status, alternate_view, alt_text
        ) values (
          new.id,
          nullif(asset->>'storageKey', ''),
          nullif(asset->>'url', ''),
          nullif(asset->>'thumbnailUrl', ''),
          'image',
          case when asset->>'width' ~ '^[0-9]{1,9}$' then (asset->>'width')::integer else null end,
          case when asset->>'height' ~ '^[0-9]{1,9}$' then (asset->>'height')::integer else null end,
          asset_position,
          media_moderation_status,
          coalesce(asset->>'alternateView', ''),
          coalesce(new.image_alt, '')
        )
        on conflict (listing_id, position) do update set
          storage_key = excluded.storage_key,
          source_url = excluded.source_url,
          thumbnail_url = excluded.thumbnail_url,
          media_type = excluded.media_type,
          width = excluded.width,
          height = excluded.height,
          moderation_status = excluded.moderation_status,
          alternate_view = excluded.alternate_view,
          alt_text = excluded.alt_text;
        asset_position := asset_position + 1;
      end if;
    end loop;
    delete from public.listing_media where listing_id = new.id and position >= asset_position;
  elsif nullif(new.image_url, '') is not null then
    insert into public.listing_media (
      listing_id, source_url, position, moderation_status, alt_text
    ) values (new.id, new.image_url, 0, media_moderation_status, coalesce(new.image_alt, ''))
    on conflict (listing_id, position) do update set
      source_url = excluded.source_url,
      moderation_status = excluded.moderation_status,
      alt_text = excluded.alt_text;
    delete from public.listing_media where listing_id = new.id and position > 0;
  else
    delete from public.listing_media where listing_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_sync_listing_media on public.posts;
create trigger posts_sync_listing_media
after insert or update of image_assets, image_url, image_alt, moderation_status
on public.posts
for each row execute function public.sync_listing_media_assets();

insert into public.listing_media (
  listing_id, storage_key, source_url, thumbnail_url, media_type, width, height,
  position, moderation_status, alternate_view, alt_text
)
select
  post.id,
  nullif(asset.value->>'storageKey', ''),
  nullif(asset.value->>'url', ''),
  nullif(asset.value->>'thumbnailUrl', ''),
  'image',
  case when asset.value->>'width' ~ '^[0-9]{1,9}$' then (asset.value->>'width')::integer else null end,
  case when asset.value->>'height' ~ '^[0-9]{1,9}$' then (asset.value->>'height')::integer else null end,
  (asset.ordinality - 1)::integer,
  case post.moderation_status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'pending' end,
  coalesce(asset.value->>'alternateView', ''),
  coalesce(post.image_alt, '')
from public.posts post
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(post.image_assets) = 'array' then post.image_assets else '[]'::jsonb end
) with ordinality as asset(value, ordinality)
where nullif(asset.value->>'url', '') is not null
   or nullif(asset.value->>'storageKey', '') is not null
on conflict (listing_id, position) do nothing;

insert into public.listing_media (listing_id, source_url, position, moderation_status, alt_text)
select post.id, post.image_url, 0,
  case post.moderation_status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'pending' end,
  coalesce(post.image_alt, '')
from public.posts post
where nullif(post.image_url, '') is not null
  and not exists (select 1 from public.listing_media media where media.listing_id = post.id)
on conflict (listing_id, position) do nothing;

alter table public.listing_media enable row level security;
revoke all on public.listing_media from public, anon, authenticated;
grant all on public.listing_media to service_role;

alter table public.marketplace_engagement_events
  add column if not exists idempotency_key text,
  add column if not exists abuse_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(abuse_metadata) = 'object');

create unique index if not exists marketplace_events_idempotency_key_idx
  on public.marketplace_engagement_events (idempotency_key)
  where idempotency_key is not null;
create index if not exists marketplace_events_listing_type_time_idx
  on public.marketplace_engagement_events (listing_id, event_type, occurred_at desc);
create index if not exists marketplace_events_retention_idx
  on public.marketplace_engagement_events (occurred_at);

create table if not exists public.marketplace_listing_aggregates (
  listing_id uuid not null references public.posts(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  formula_version text not null,
  qualified_impressions bigint not null default 0 check (qualified_impressions >= 0),
  qualified_views bigint not null default 0 check (qualified_views >= 0),
  likes bigint not null default 0 check (likes >= 0),
  saves bigint not null default 0 check (saves >= 0),
  shares bigint not null default 0 check (shares >= 0),
  enquiries bigint not null default 0 check (enquiries >= 0),
  completed_order_items bigint not null default 0 check (completed_order_items >= 0),
  hidden_or_reported bigint not null default 0 check (hidden_or_reported >= 0),
  unique_engagers bigint not null default 0 check (unique_engagers >= 0),
  engagement_rate numeric(12, 8) not null default 0 check (engagement_rate >= 0),
  trend_score numeric(18, 8) not null default 0,
  score_components jsonb not null default '{}'::jsonb check (jsonb_typeof(score_components) = 'object'),
  computed_at timestamptz not null default now(),
  primary key (listing_id, window_start, window_end, formula_version),
  check (window_end > window_start)
);

create index if not exists listing_aggregates_window_score_idx
  on public.marketplace_listing_aggregates (window_start desc, trend_score desc);
create index if not exists listing_aggregates_computed_idx
  on public.marketplace_listing_aggregates (computed_at desc);
alter table public.marketplace_listing_aggregates enable row level security;
revoke all on public.marketplace_listing_aggregates from public, anon, authenticated;
grant all on public.marketplace_listing_aggregates to service_role;

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  buyer_display_snapshot text not null default '' check (char_length(buyer_display_snapshot) <= 200),
  seller_business_snapshot text not null default '' check (char_length(seller_business_snapshot) <= 200),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'in_progress', 'completed', 'cancelled',
    'refund_requested', 'refunded', 'disputed'
  )),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  completed_at timestamptz,
  cancelled_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id is null or seller_id is null or buyer_id <> seller_id),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'refund_requested' or refund_requested_at is not null),
  check (status <> 'refunded' or refunded_at is not null),
  check (status <> 'disputed' or disputed_at is not null)
);

create index if not exists marketplace_orders_buyer_created_idx on public.marketplace_orders (buyer_id, created_at desc);
create index if not exists marketplace_orders_seller_status_created_idx on public.marketplace_orders (seller_id, status, created_at desc);
create index if not exists marketplace_orders_completed_idx on public.marketplace_orders (completed_at desc) where status = 'completed';
alter table public.marketplace_orders enable row level security;
revoke all on public.marketplace_orders from public, anon, authenticated;
grant all on public.marketplace_orders to service_role;

create table if not exists public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  listing_id uuid references public.posts(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  listing_title_snapshot text not null check (char_length(listing_title_snapshot) <= 300),
  listing_type_snapshot text not null check (listing_type_snapshot in ('CLOTHING', 'FABRIC', 'TAILOR_PORTFOLIO')),
  quantity numeric(18, 3) not null check (quantity > 0),
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  line_amount_minor bigint not null check (line_amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  unit_of_sale text not null default 'piece' check (unit_of_sale in ('piece', 'yard', 'metre', 'roll', 'service')),
  item_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(item_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_order_items_order_idx on public.marketplace_order_items (order_id);
create index if not exists marketplace_order_items_listing_idx on public.marketplace_order_items (listing_id) where listing_id is not null;
create index if not exists marketplace_order_items_seller_idx on public.marketplace_order_items (seller_id, created_at desc);
alter table public.marketplace_order_items enable row level security;
revoke all on public.marketplace_order_items from public, anon, authenticated;
grant all on public.marketplace_order_items to service_role;

create table if not exists public.marketplace_order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_order_status_history_order_idx
  on public.marketplace_order_status_history (order_id, created_at desc);
alter table public.marketplace_order_status_history enable row level security;
revoke all on public.marketplace_order_status_history from public, anon, authenticated;
grant all on public.marketplace_order_status_history to service_role;

create or replace function public.record_marketplace_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.marketplace_order_status_history (
      order_id, previous_status, new_status, actor_id
    ) values (
      new.id, case when tg_op = 'INSERT' then null else old.status end,
      new.status, auth.uid()
    );
  end if;
  return new;
end;
$$;

create or replace function public.set_marketplace_order_lifecycle_timestamps()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    (new.buyer_id is distinct from old.buyer_id and new.buyer_id is not null)
    or (new.seller_id is distinct from old.seller_id and new.seller_id is not null)
    or new.currency is distinct from old.currency
    or new.buyer_display_snapshot is distinct from old.buyer_display_snapshot
    or new.seller_business_snapshot is distinct from old.seller_business_snapshot
  ) then
    raise exception 'Marketplace order participants, currency, and identity snapshots are immutable.';
  end if;
  if tg_op = 'INSERT' and new.status <> 'pending' then
    raise exception 'New orders must start in pending status.';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('accepted', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('in_progress', 'cancelled', 'disputed'))
    or (old.status = 'in_progress' and new.status in ('completed', 'cancelled', 'disputed'))
    or (old.status = 'completed' and new.status in ('refund_requested', 'disputed'))
    or (old.status = 'refund_requested' and new.status in ('refunded', 'completed', 'disputed'))
    or (old.status = 'disputed' and new.status in ('completed', 'cancelled', 'refunded'))
  ) then
    raise exception 'Invalid marketplace order status transition.';
  end if;
  if tg_op = 'INSERT' and (
    new.buyer_id is null
    or new.seller_id is null
    or exists (select 1 from public.profiles buyer where buyer.id = new.buyer_id and buyer.is_blocked)
    or not exists (
      select 1 from public.profiles seller
      join public.seller_profiles seller_profile on seller_profile.user_id = seller.id
      where seller.id = new.seller_id
        and seller.role in ('tailor', 'fabric_seller')
        and seller.is_blocked = false
        and seller_profile.is_public = true
        and seller_profile.is_active = true
    )
  ) then
    raise exception 'Order participants must be active marketplace accounts.';
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  if new.status = 'refund_requested' and new.refund_requested_at is null then
    new.refund_requested_at := now();
  end if;
  if new.status = 'refunded' and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  if new.status = 'disputed' and new.disputed_at is null then
    new.disputed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketplace_orders_status_history on public.marketplace_orders;
drop trigger if exists marketplace_orders_lifecycle_timestamps on public.marketplace_orders;
create trigger marketplace_orders_lifecycle_timestamps
before insert or update
on public.marketplace_orders
for each row execute function public.set_marketplace_order_lifecycle_timestamps();

create trigger marketplace_orders_status_history
after insert or update of status
on public.marketplace_orders
for each row execute function public.record_marketplace_order_status();

create or replace function public.validate_marketplace_order_item()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_order public.marketplace_orders%rowtype;
begin
  select * into parent_order from public.marketplace_orders where id = new.order_id for key share;
  if not found then raise exception 'Order does not exist.'; end if;
  if (
    parent_order.seller_id is distinct from new.seller_id
    and not (tg_op = 'UPDATE' and new.seller_id is null)
  ) or parent_order.currency <> new.currency then
    raise exception 'Order items must match the order seller and currency.';
  end if;
  if tg_op = 'INSERT' and (parent_order.seller_id is null or new.seller_id is null) then
    raise exception 'New order items require an active seller relationship.';
  end if;
  if new.line_amount_minor <> round(new.quantity * new.unit_amount_minor)::bigint then
    raise exception 'Order item total does not match its quantity and unit amount.';
  end if;
  if tg_op = 'INSERT' and new.listing_id is not null and not exists (
    select 1 from public.posts listing
    where listing.id = new.listing_id and listing.author_id = new.seller_id
      and listing.status = 'published' and listing.moderation_status = 'approved'
      and listing.deleted_at is null and listing.is_blocked = false
      and listing.availability <> 'unavailable'
  ) then
    raise exception 'Order item listing does not belong to its seller.';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_order_items_validate on public.marketplace_order_items;
create trigger marketplace_order_items_validate
before insert or update on public.marketplace_order_items
for each row execute function public.validate_marketplace_order_item();

create or replace function public.validate_marketplace_order_amounts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  item_subtotal bigint;
  target_order_ids uuid[];
  target_order_id uuid;
  parent_order public.marketplace_orders%rowtype;
begin
  if tg_table_name = 'marketplace_orders' then
    target_order_ids := array[new.id];
  elsif tg_op = 'DELETE' then
    target_order_ids := array[old.order_id];
  elsif tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    target_order_ids := array[old.order_id, new.order_id];
  else
    target_order_ids := array[new.order_id];
  end if;

  foreach target_order_id in array target_order_ids loop
    select * into parent_order from public.marketplace_orders where id = target_order_id;
    if found then
      select coalesce(sum(line_amount_minor), 0) into item_subtotal
      from public.marketplace_order_items where order_id = target_order_id;
      if item_subtotal <> parent_order.subtotal_minor or parent_order.subtotal_minor > parent_order.total_minor then
        raise exception 'Order amounts do not reconcile with the order items.';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists marketplace_orders_validate_amounts on public.marketplace_orders;
create constraint trigger marketplace_orders_validate_amounts
after insert or update of subtotal_minor, total_minor
on public.marketplace_orders
deferrable initially deferred
for each row execute function public.validate_marketplace_order_amounts();

create constraint trigger marketplace_order_items_validate_order_amounts
after insert or update or delete
on public.marketplace_order_items
deferrable initially deferred
for each row execute function public.validate_marketplace_order_amounts();

create table if not exists public.seller_metrics (
  seller_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  formula_version text not null,
  completed_orders bigint not null default 0 check (completed_orders >= 0),
  cancelled_orders bigint not null default 0 check (cancelled_orders >= 0),
  refunded_orders bigint not null default 0 check (refunded_orders >= 0),
  disputed_orders bigint not null default 0 check (disputed_orders >= 0),
  completed_order_rate numeric(12, 8),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  computed_at timestamptz not null default now(),
  primary key (seller_id, window_start, window_end, formula_version),
  check (window_end > window_start)
);
create index if not exists seller_metrics_window_completed_idx
  on public.seller_metrics (window_start desc, completed_orders desc);
alter table public.seller_metrics enable row level security;
revoke all on public.seller_metrics from public, anon, authenticated;
grant all on public.seller_metrics to service_role;

create or replace function public.refresh_marketplace_seller_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_formula_version text default 'seller-metrics-v1'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to refresh seller metrics' using errcode = '42501';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start
    or p_formula_version is null or length(p_formula_version) not between 1 and 80 then
    raise exception 'Invalid seller metric window or formula version.';
  end if;

  insert into public.seller_metrics (
    seller_id, window_start, window_end, formula_version,
    completed_orders, cancelled_orders, refunded_orders, disputed_orders,
    completed_order_rate, metrics, computed_at
  )
  select
    seller.id,
    p_window_start,
    p_window_end,
    p_formula_version,
    count(ord.id) filter (where ord.status = 'completed' and ord.completed_at >= p_window_start and ord.completed_at < p_window_end),
    count(ord.id) filter (where ord.status = 'cancelled' and ord.cancelled_at >= p_window_start and ord.cancelled_at < p_window_end),
    count(ord.id) filter (where ord.refunded_at >= p_window_start and ord.refunded_at < p_window_end),
    count(ord.id) filter (where ord.disputed_at >= p_window_start and ord.disputed_at < p_window_end),
    case
      when count(ord.id) filter (
        where ord.status in ('completed', 'cancelled')
          and coalesce(ord.completed_at, ord.cancelled_at) >= p_window_start
          and coalesce(ord.completed_at, ord.cancelled_at) < p_window_end
      ) > 0
      then count(ord.id) filter (
        where ord.status = 'completed' and ord.completed_at >= p_window_start and ord.completed_at < p_window_end
      )::numeric
      / count(ord.id) filter (
        where ord.status in ('completed', 'cancelled')
          and coalesce(ord.completed_at, ord.cancelled_at) >= p_window_start
          and coalesce(ord.completed_at, ord.cancelled_at) < p_window_end
      )
      else null
    end,
    jsonb_build_object('formula_version', p_formula_version),
    now()
  from public.seller_profiles seller
  left join public.marketplace_orders ord
    on ord.seller_id = seller.user_id
    and (
      (ord.completed_at >= p_window_start and ord.completed_at < p_window_end)
      or (ord.cancelled_at >= p_window_start and ord.cancelled_at < p_window_end)
      or (ord.refunded_at >= p_window_start and ord.refunded_at < p_window_end)
      or (ord.disputed_at >= p_window_start and ord.disputed_at < p_window_end)
    )
  group by seller.user_id
  on conflict (seller_id, window_start, window_end, formula_version) do update set
    completed_orders = excluded.completed_orders,
    cancelled_orders = excluded.cancelled_orders,
    refunded_orders = excluded.refunded_orders,
    disputed_orders = excluded.disputed_orders,
    completed_order_rate = excluded.completed_order_rate,
    metrics = excluded.metrics,
    computed_at = now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_marketplace_seller_metrics(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.refresh_marketplace_seller_metrics(timestamptz, timestamptz, text)
  to service_role;

create table if not exists public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  verification_type text not null check (verification_type in ('identity', 'business', 'skill')),
  evidence_storage_key text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'revoked')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  decision_reason text not null default '' check (char_length(decision_reason) <= 1000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('approved', 'rejected', 'revoked', 'expired')) = (reviewed_at is not null))
);
create index if not exists seller_verifications_private_review_idx
  on public.seller_verifications (status, submitted_at);
create index if not exists seller_verifications_seller_type_idx
  on public.seller_verifications (seller_id, verification_type, status);
alter table public.seller_verifications enable row level security;
revoke all on public.seller_verifications from public, anon, authenticated;
grant all on public.seller_verifications to service_role;

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  consented_to_personalization boolean not null default false,
  preferred_categories text[] not null default array[]::text[],
  preferred_styles text[] not null default array[]::text[],
  preferred_materials text[] not null default array[]::text[],
  minimum_price_minor bigint check (minimum_price_minor is null or minimum_price_minor >= 0),
  maximum_price_minor bigint check (maximum_price_minor is null or maximum_price_minor >= 0),
  currency char(3),
  preferred_country text,
  preferred_region text,
  updated_at timestamptz not null default now(),
  check (minimum_price_minor is null or maximum_price_minor is null or minimum_price_minor <= maximum_price_minor),
  check (currency is null or currency ~ '^[A-Z]{3}$')
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant all on public.user_preferences to service_role;

create table if not exists public.user_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.posts(id) on delete cascade,
  interaction_type text not null check (interaction_type in ('hide', 'dismiss', 'not_interested')),
  reason text not null default '' check (char_length(reason) <= 500),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id, interaction_type)
);
create index if not exists user_interactions_listing_idx
  on public.user_interactions (listing_id, interaction_type, created_at desc);
create index if not exists user_interactions_user_active_idx
  on public.user_interactions (user_id, created_at desc)
  where expires_at is null;
create index if not exists user_interactions_expiry_idx
  on public.user_interactions (expires_at)
  where expires_at is not null;
alter table public.user_interactions enable row level security;
revoke all on public.user_interactions from public, anon, authenticated;
grant all on public.user_interactions to service_role;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_user_id, created_at desc);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;
grant all on public.user_blocks to service_role;

create table if not exists public.marketplace_search_audit_events (
  id bigint generated always as identity primary key,
  search_text text not null check (char_length(search_text) between 2 and 80),
  event_type text not null check (event_type in ('impression', 'click', 'save', 'enquiry')),
  listing_id uuid references public.posts(id) on delete set null,
  result_count integer check (result_count is null or result_count between 0 and 10000),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.marketplace_search_audit_events
  enable row level security;
revoke all on public.marketplace_search_audit_events
  from public, anon, authenticated;
grant all on public.marketplace_search_audit_events to service_role;
create index if not exists marketplace_search_audit_created_idx
  on public.marketplace_search_audit_events (created_at);
create index if not exists marketplace_search_audit_query_created_idx
  on public.marketplace_search_audit_events (search_text, created_at);

alter table public.marketplace_search_audit_events
  add column if not exists filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object'),
  add column if not exists ranked_position integer
    check (ranked_position is null or ranked_position > 0),
  add column if not exists eligible_exposure boolean not null default false;

create table if not exists public.recommendation_impressions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  session_hash text check (session_hash is null or session_hash ~ '^[0-9a-f]{64}$'),
  listing_id uuid not null references public.posts(id) on delete cascade,
  feed_name text not null check (feed_name in ('for_you', 'trending', 'category', 'search')),
  ranked_position integer not null check (ranked_position > 0),
  reason_code text not null default '',
  experiment_version text not null,
  occurred_at timestamptz not null default now(),
  check (user_id is not null or session_hash is not null)
);
create index if not exists recommendation_impressions_listing_time_idx
  on public.recommendation_impressions (listing_id, occurred_at desc);
create index if not exists recommendation_impressions_user_time_idx
  on public.recommendation_impressions (user_id, occurred_at desc)
  where user_id is not null;
create index if not exists recommendation_impressions_session_time_idx
  on public.recommendation_impressions (session_hash, occurred_at desc)
  where session_hash is not null;
create index if not exists recommendation_impressions_retention_idx
  on public.recommendation_impressions (occurred_at);
alter table public.recommendation_impressions enable row level security;
revoke all on public.recommendation_impressions from public, anon, authenticated;
grant all on public.recommendation_impressions to service_role;

create or replace function public.purge_marketplace_intelligence_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_retention integer;
  removed_events bigint;
  removed_search_events bigint;
  removed_impressions bigint;
  removed_interactions bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to purge marketplace analytics' using errcode = '42501';
  end if;

  select event_retention_days into event_retention
  from public.marketplace_trend_config where id = true;
  event_retention := greatest(coalesce(event_retention, 180), 30);

  delete from public.marketplace_engagement_events
  where occurred_at < now() - make_interval(days => event_retention);
  get diagnostics removed_events = row_count;

  delete from public.marketplace_search_audit_events
  where created_at < now() - interval '30 days';
  get diagnostics removed_search_events = row_count;

  delete from public.recommendation_impressions
  where occurred_at < now() - interval '180 days';
  get diagnostics removed_impressions = row_count;

  delete from public.user_interactions
  where expires_at is not null and expires_at <= now();
  get diagnostics removed_interactions = row_count;

  return jsonb_build_object(
    'events', removed_events,
    'search_events', removed_search_events,
    'recommendation_impressions', removed_impressions,
    'expired_interactions', removed_interactions
  );
end;
$$;

revoke all on function public.purge_marketplace_intelligence_data()
  from public, anon, authenticated;
grant execute on function public.purge_marketplace_intelligence_data()
  to service_role;

create table if not exists public.seller_reports (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('fraud', 'impersonation', 'harassment', 'personal_information', 'spam', 'policy_violation', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (seller_id <> reporter_id)
);
create unique index if not exists seller_reports_one_open_per_reporter_idx
  on public.seller_reports (seller_id, reporter_id) where status = 'open';
create index if not exists seller_reports_open_idx
  on public.seller_reports (created_at desc) where status = 'open';

create table if not exists public.moderation_decisions (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('listing', 'listing_media', 'seller', 'seller_verification', 'review', 'report')),
  target_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected', 'removed', 'restored', 'warned', 'blocked', 'dismissed', 'appeal_upheld', 'appeal_overturned')),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 2000),
  previous_state jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_state) = 'object'),
  new_state jsonb not null default '{}'::jsonb check (jsonb_typeof(new_state) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists moderation_decisions_target_idx
  on public.moderation_decisions (target_type, target_id, created_at desc);
create index if not exists moderation_decisions_actor_time_idx
  on public.moderation_decisions (actor_id, created_at desc)
  where actor_id is not null;

create table if not exists public.marketplace_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id text not null check (char_length(target_id) <= 200),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_audit_target_time_idx
  on public.marketplace_audit_log (target_type, target_id, created_at desc);
create index if not exists marketplace_audit_actor_time_idx
  on public.marketplace_audit_log (actor_id, created_at desc)
  where actor_id is not null;

alter table public.seller_reports enable row level security;
alter table public.moderation_decisions enable row level security;
alter table public.marketplace_audit_log enable row level security;
revoke all on public.seller_reports, public.moderation_decisions, public.marketplace_audit_log
  from public, anon, authenticated;
grant all on public.seller_reports, public.moderation_decisions, public.marketplace_audit_log
  to service_role;
grant usage, select on sequence public.marketplace_order_status_history_id_seq,
  public.moderation_decisions_id_seq, public.marketplace_audit_log_id_seq
  to service_role;

alter table public.listing_reviews
  add column if not exists order_id uuid references public.marketplace_orders(id) on delete set null;
alter table public.seller_reviews
  add column if not exists order_id uuid references public.marketplace_orders(id) on delete set null;

alter table public.listing_reviews
  drop constraint if exists listing_reviews_verification_status_check,
  drop constraint if exists listing_reviews_eligibility_type_check,
  drop constraint if exists listing_reviews_firsthand_attested_check,
  add constraint listing_reviews_verification_status_check
    check (verification_status in ('unverified', 'verified_order')),
  add constraint listing_reviews_eligibility_type_check
    check (eligibility_type in ('firsthand_attestation', 'completed_order')),
  add constraint listing_reviews_eligibility_evidence_check
    check (firsthand_attested or order_id is not null or moderation_status in ('removed', 'rejected')),
  add constraint listing_reviews_verification_matches_order_check
    check (
      (order_id is null and verification_status = 'unverified' and eligibility_type = 'firsthand_attestation')
      or (order_id is not null and (
        (verification_status = 'verified_order' and eligibility_type = 'completed_order')
        or (verification_status = 'unverified' and eligibility_type in ('completed_order', 'firsthand_attestation'))
      ))
    );

alter table public.seller_reviews
  drop constraint if exists seller_reviews_verification_status_check,
  drop constraint if exists seller_reviews_eligibility_type_check,
  drop constraint if exists seller_reviews_firsthand_attested_check,
  add constraint seller_reviews_verification_status_check
    check (verification_status in ('unverified', 'verified_order')),
  add constraint seller_reviews_eligibility_type_check
    check (eligibility_type in ('firsthand_attestation', 'completed_order')),
  add constraint seller_reviews_eligibility_evidence_check
    check (firsthand_attested or order_id is not null or moderation_status in ('removed', 'rejected')),
  add constraint seller_reviews_verification_matches_order_check
    check (
      (order_id is null and verification_status = 'unverified' and eligibility_type = 'firsthand_attestation')
      or (order_id is not null and (
        (verification_status = 'verified_order' and eligibility_type = 'completed_order')
        or (verification_status = 'unverified' and eligibility_type in ('completed_order', 'firsthand_attestation'))
      ))
    );

create unique index if not exists listing_reviews_one_per_order_target_idx
  on public.listing_reviews (order_id, listing_id, reviewer_id)
  where order_id is not null;
create unique index if not exists seller_reviews_one_per_order_target_idx
  on public.seller_reviews (order_id, seller_id, reviewer_id)
  where order_id is not null;
create index if not exists listing_reviews_order_idx on public.listing_reviews (order_id) where order_id is not null;
create index if not exists seller_reviews_order_idx on public.seller_reviews (order_id) where order_id is not null;

create or replace function public.validate_order_verified_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.marketplace_orders%rowtype;
begin
  if new.order_id is null then
    new.verification_status := 'unverified';
    new.eligibility_type := 'firsthand_attestation';
    if tg_op = 'UPDATE' and old.order_id is not null and not new.firsthand_attested then
      new.moderation_status := 'removed';
      new.moderation_note := 'Order evidence was deleted; this review is no longer eligible.';
      insert into public.review_audit_log (
        review_type, review_id, actor_id, action, reason
      ) values (
        case when tg_table_name = 'listing_reviews' then 'listing' else 'seller' end,
        new.id, auth.uid(), 'moderated',
        'Order evidence was deleted; review eligibility was removed.'
      );
    end if;
    return new;
  end if;

  select * into order_row from public.marketplace_orders
  where id = new.order_id for key share;
  if not found or order_row.status <> 'completed' or order_row.buyer_id <> new.reviewer_id
    or order_row.seller_id <> new.seller_id then
    raise exception 'Only the buyer on a completed order for this seller may submit a verified review.';
  end if;
  if (tg_table_name = 'listing_reviews' or new.listing_id is not null) and not exists (
    select 1 from public.marketplace_order_items item
    where item.order_id = new.order_id and item.listing_id = new.listing_id
      and item.seller_id = new.seller_id
  ) then
    raise exception 'The reviewed listing must have been included in the completed order.';
  end if;

  new.verification_status := 'verified_order';
  new.eligibility_type := 'completed_order';
  return new;
end;
$$;

drop trigger if exists listing_reviews_verify_order on public.listing_reviews;
create trigger listing_reviews_verify_order
before insert or update of order_id, reviewer_id, seller_id, listing_id
on public.listing_reviews
for each row execute function public.validate_order_verified_review();

drop trigger if exists seller_reviews_verify_order on public.seller_reviews;
create trigger seller_reviews_verify_order
before insert or update of order_id, reviewer_id, seller_id, listing_id
on public.seller_reviews
for each row execute function public.validate_order_verified_review();

create or replace function public.invalidate_order_verified_reviews()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('cancelled', 'refund_requested', 'refunded', 'disputed') then
    with invalidated as (
      update public.listing_reviews
      set verification_status = 'unverified',
          eligibility_type = case when firsthand_attested then 'firsthand_attestation' else 'completed_order' end,
          moderation_status = case when firsthand_attested then moderation_status else 'pending' end,
          moderation_note = case when firsthand_attested then moderation_note else 'Order status changed; review eligibility requires moderation.' end,
          updated_at = now()
      where order_id = new.id and verification_status = 'verified_order'
      returning id
    )
    insert into public.review_audit_log (
      review_type, review_id, actor_id, action, reason
    )
    select 'listing', invalidated.id, auth.uid(), 'moderated',
      'Order status changed; verified-order eligibility was suspended.'
    from invalidated;

    with invalidated as (
      update public.seller_reviews
      set verification_status = 'unverified',
          eligibility_type = case when firsthand_attested then 'firsthand_attestation' else 'completed_order' end,
          moderation_status = case when firsthand_attested then moderation_status else 'pending' end,
          moderation_note = case when firsthand_attested then moderation_note else 'Order status changed; review eligibility requires moderation.' end,
          updated_at = now()
      where order_id = new.id and verification_status = 'verified_order'
      returning id
    )
    insert into public.review_audit_log (
      review_type, review_id, actor_id, action, reason
    )
    select 'seller', invalidated.id, auth.uid(), 'moderated',
      'Order status changed; verified-order eligibility was suspended.'
    from invalidated;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_orders_invalidate_reviews on public.marketplace_orders;
create trigger marketplace_orders_invalidate_reviews
after update of status on public.marketplace_orders
for each row when (old.status is distinct from new.status)
execute function public.invalidate_order_verified_reviews();

create or replace function public.refresh_marketplace_listing_aggregates(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_formula_version text default 'marketplace-v1'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to refresh listing aggregates' using errcode = '42501';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start
    or p_formula_version is null or length(p_formula_version) not between 1 and 80 then
    raise exception 'Invalid listing aggregate window or formula version.';
  end if;

  insert into public.marketplace_listing_aggregates (
    listing_id, window_start, window_end, formula_version,
    qualified_impressions, qualified_views, likes, saves, shares, enquiries,
    completed_order_items, hidden_or_reported, unique_engagers, engagement_rate,
    trend_score, score_components, computed_at
  )
  select
    listing.id, p_window_start, p_window_end, p_formula_version,
    count(event.id) filter (where event.event_type = 'IMPRESSION'),
    count(event.id) filter (where event.event_type = 'VIEW'),
    count(event.id) filter (where event.event_type = 'LIKE'),
    count(event.id) filter (where event.event_type = 'SAVE'),
    count(event.id) filter (where event.event_type = 'SHARE'),
    count(event.id) filter (where event.event_type = 'ENQUIRY'),
    (
      select count(*) from public.marketplace_order_items item
      join public.marketplace_orders ord on ord.id = item.order_id
      where item.listing_id = listing.id and ord.status = 'completed'
        and ord.completed_at >= p_window_start and ord.completed_at < p_window_end
    ),
    count(event.id) filter (where event.event_type in ('HIDE', 'REPORT')),
    count(distinct coalesce(event.actor_id::text, event.session_hash))
      filter (where event.event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY')),
    case when count(event.id) filter (where event.event_type = 'IMPRESSION') > 0
      then count(event.id) filter (where event.event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY'))::numeric
        / count(event.id) filter (where event.event_type = 'IMPRESSION')
      else 0 end,
    coalesce(trend.fast_trend_score, 0),
    jsonb_build_object(
      'qualified_impressions', count(event.id) filter (where event.event_type = 'IMPRESSION'),
      'qualified_views', count(event.id) filter (where event.event_type = 'VIEW'),
      'intent_events', count(event.id) filter (where event.event_type in ('LIKE', 'SAVE', 'SHARE', 'ENQUIRY')),
      'engagement_rate', case when count(event.id) filter (where event.event_type = 'IMPRESSION') > 0
        then count(event.id) filter (where event.event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY'))::numeric
          / count(event.id) filter (where event.event_type = 'IMPRESSION')
        else 0 end,
      'completed_order_items', (
        select count(*) from public.marketplace_order_items item
        join public.marketplace_orders ord on ord.id = item.order_id
        where item.listing_id = listing.id and ord.status = 'completed'
          and ord.completed_at >= p_window_start and ord.completed_at < p_window_end
      ),
      'trend_score', coalesce(trend.fast_trend_score, 0),
      'trend_momentum', coalesce(trend.momentum_ratio, 0),
      'trend_confidence', coalesce(trend.confidence, 0),
      'trend_components', coalesce(trend.components, '{}'::jsonb),
      'formula_version', p_formula_version
    ),
    now()
  from public.posts listing
  join public.profiles seller on seller.id = listing.author_id
  left join public.marketplace_engagement_events event
    on event.listing_id = listing.id
    and event.occurred_at >= p_window_start and event.occurred_at < p_window_end
  left join public.marketplace_trend_scores trend
    on trend.listing_id = listing.id
    and trend.scope_type = 'global'
    and trend.scope_value = 'global'
  where listing.listing_type in ('CLOTHING', 'FABRIC')
    and listing.status = 'published'
    and listing.moderation_status = 'approved'
    and listing.deleted_at is null
    and listing.is_blocked = false
    and listing.availability <> 'unavailable'
    and seller.is_blocked = false
  group by listing.id
  on conflict (listing_id, window_start, window_end, formula_version) do update set
    qualified_impressions = excluded.qualified_impressions,
    qualified_views = excluded.qualified_views,
    likes = excluded.likes,
    saves = excluded.saves,
    shares = excluded.shares,
    enquiries = excluded.enquiries,
    completed_order_items = excluded.completed_order_items,
    hidden_or_reported = excluded.hidden_or_reported,
    unique_engagers = excluded.unique_engagers,
    engagement_rate = excluded.engagement_rate,
    trend_score = excluded.trend_score,
    score_components = excluded.score_components,
    computed_at = now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_marketplace_listing_aggregates(timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.refresh_marketplace_listing_aggregates(timestamptz, timestamptz, text)
  to service_role;

create or replace function public.set_marketplace_model_updated_at()
returns trigger
language plpgsql
set search_path = pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'seller_profiles', 'clothing_details', 'fabric_details',
    'marketplace_orders', 'seller_verifications', 'user_preferences',
    'user_interactions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_marketplace_model_updated_at()',
      table_name || '_updated_at', table_name
    );
  end loop;
end;
$$;

revoke all on function public.sync_seller_profile_from_user(),
  public.sync_listing_type_details(),
  public.sync_listing_media_assets(),
  public.record_marketplace_order_status(),
  public.set_marketplace_order_lifecycle_timestamps(),
  public.validate_marketplace_order_item(),
  public.validate_marketplace_order_amounts(),
  public.validate_order_verified_review(),
  public.invalidate_order_verified_reviews(),
  public.set_marketplace_model_updated_at()
  from public, anon, authenticated;

commit;
