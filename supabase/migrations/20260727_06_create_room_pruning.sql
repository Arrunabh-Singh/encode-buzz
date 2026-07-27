-- R19: stale rooms were only pruned once the table hit 100 rows, so a
-- moderately busy period leaves them all sitting there until the next spike.
-- Prune every time — the delete cascades to players/presses/rounds via FK,
-- and keeping the table small keeps the count scan below it cheap too.
create or replace function public.create_room()
 returns jsonb
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_code text;
  v_secret text;
  v_room_count integer;
begin
  delete from rooms where now() - last_activity_at > interval '2 hours';

  select count(*) into v_room_count from rooms;
  if v_room_count >= 100 then
    return jsonb_build_object('error', 'Server full, try again later');
  end if;

  loop
    v_code := generate_room_code();
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;

  v_secret := encode(gen_random_bytes(16), 'hex');
  insert into rooms (code, host_secret) values (v_code, v_secret);

  return jsonb_build_object('code', v_code, 'hostSecret', v_secret);
end;
$function$
