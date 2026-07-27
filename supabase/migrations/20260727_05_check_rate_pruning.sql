-- R19: rate_limits rows are never deleted once their window closes. Sweep
-- stale buckets on ~1% of calls (amortized) instead of adding a bulk-delete
-- cost to every single request.
create or replace function public.check_rate(p_bucket text, p_limit integer, p_window_seconds integer)
 returns boolean
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if random() < 0.01 then
    delete from rate_limits where window_start < v_now - interval '1 hour';
  end if;

  select * into v_row from rate_limits where bucket = p_bucket for update;
  if not found then
    insert into rate_limits (bucket, window_start, count) values (p_bucket, v_now, 1);
    return true;
  end if;
  if v_now - v_row.window_start > (p_window_seconds || ' seconds')::interval then
    update rate_limits set window_start = v_now, count = 1 where bucket = p_bucket;
    return true;
  end if;
  if v_row.count >= p_limit then
    return false;
  end if;
  update rate_limits set count = count + 1 where bucket = p_bucket;
  return true;
end;
$function$
