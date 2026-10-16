begin;

delete from public.marketplace_engagement_events
where event_type in ('ADD_TO_CART', 'PURCHASE');

alter table public.marketplace_engagement_events
  drop constraint if exists marketplace_engagement_events_event_type_check;
alter table public.marketplace_engagement_events
  add constraint marketplace_engagement_events_event_type_check
  check (event_type in (
    'IMPRESSION', 'VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY',
    'HIDE', 'REPORT', 'CREATION'
  ));

delete from public.discovery_events
where event_type in ('ADD_TO_CART', 'PURCHASE');

alter table public.discovery_events
  drop constraint if exists discovery_events_event_type_check;
alter table public.discovery_events
  add constraint discovery_events_event_type_check
  check (event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'RATING'));

update public.marketplace_trend_config
set event_weights = event_weights - 'ADD_TO_CART' - 'PURCHASE',
    updated_at = now()
where event_weights ? 'ADD_TO_CART' or event_weights ? 'PURCHASE';

commit;
