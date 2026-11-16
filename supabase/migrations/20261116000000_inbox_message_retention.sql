create index if not exists messages_timestamp_retention_idx
  on public.messages (timestamp);

create index if not exists notifications_created_at_retention_idx
  on public.notifications (created_at);
