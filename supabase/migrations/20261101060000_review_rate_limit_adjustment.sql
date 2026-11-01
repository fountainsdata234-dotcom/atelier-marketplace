begin;

update public.marketplace_abuse_rate_config
set account_limit = 20,
    session_limit = 10
where action = 'review_write';

delete from public.marketplace_abuse_rate_buckets
where action = 'review_write';

commit;
