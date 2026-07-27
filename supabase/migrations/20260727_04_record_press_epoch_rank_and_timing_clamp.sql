-- R9: press_rank must be scoped to lock_epoch, not just round_number — a
-- reopened buzz window should start counting from #1 again, not keep
-- climbing across the whole round's history.
-- R10: the client picks its own p_rtt_ms, which directly sizes the
-- plausibility tolerance it's judged against — a client can claim a large
-- RTT purely to buy itself a bigger window to backdate its press into.
-- Capping the tolerance at 40ms (was 120ms) and flooring elapsed_ms at
-- server_elapsed - tolerance bounds the exploitable advantage regardless of
-- what the client reports. This bounds the cheat, it does not eliminate it —
-- client-supplied timing can never be fully trusted by construction.
create or replace function public.record_press(p_code text, p_player_secret text, p_client_estimated_server_ms bigint, p_rtt_ms integer)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_room rooms%rowtype;
  v_player players%rowtype;
  v_now timestamptz := clock_timestamp();
  v_opens_at_ms bigint;
  v_server_receipt_ms bigint := (extract(epoch from v_now) * 1000)::bigint;
  v_server_elapsed integer;
  v_has_client_timing boolean;
  v_drift bigint;
  v_past_tolerance numeric;
  v_is_plausible boolean;
  v_elapsed_ms integer;
  v_client_ms integer;
  v_time_source text;
  v_false_start boolean;
  v_rank integer;
begin
  select * into v_room from rooms where code = p_code for update;
  if not found then
    return jsonb_build_object('event', 'ignored');
  end if;

  if v_room.phase = 'countdown' and v_now >= v_room.opens_at then
    update rooms set phase = 'open' where code = p_code;
    v_room.phase := 'open';
  end if;

  if v_room.phase not in ('countdown', 'open', 'locked') then
    return jsonb_build_object('event', 'ignored');
  end if;

  select * into v_player from players where room_code = p_code and secret = p_player_secret;
  if not found then
    return jsonb_build_object('event', 'session_replaced');
  end if;
  if v_player.locked_out then
    return jsonb_build_object('event', 'ignored');
  end if;

  if exists (
    select 1 from presses
    where room_code = p_code and round_number = v_room.round_number
      and lock_epoch = v_room.lock_epoch and player_id = v_player.id
  ) then
    return jsonb_build_object('event', 'ignored');
  end if;

  v_opens_at_ms := (extract(epoch from v_room.opens_at) * 1000)::bigint;
  v_server_elapsed := (v_server_receipt_ms - v_opens_at_ms)::integer;

  v_has_client_timing := p_client_estimated_server_ms is not null and p_rtt_ms is not null
    and p_rtt_ms >= 0 and p_rtt_ms <= 400;

  if not v_has_client_timing then
    v_elapsed_ms := v_server_elapsed;
    v_time_source := 'server-fallback';
    v_false_start := v_server_elapsed < 0;
    v_client_ms := null;
  else
    v_drift := p_client_estimated_server_ms - v_server_receipt_ms;
    v_past_tolerance := least(p_rtt_ms / 2.0 + 20, 40);
    v_is_plausible := v_drift <= 50 and v_drift >= -v_past_tolerance;
    v_client_ms := (p_client_estimated_server_ms - v_opens_at_ms)::integer;

    if not v_is_plausible then
      v_elapsed_ms := v_server_elapsed;
      v_time_source := 'server-fallback';
      v_false_start := v_server_elapsed < 0;
    else
      v_elapsed_ms := greatest(v_client_ms, v_server_elapsed - v_past_tolerance::integer);
      v_time_source := 'client';
      v_false_start := v_client_ms < 0;
    end if;
  end if;

  select count(*) + 1 into v_rank from presses
  where room_code = p_code and round_number = v_room.round_number and lock_epoch = v_room.lock_epoch;

  insert into presses (room_code, round_number, lock_epoch, player_id, player_name, elapsed_ms, client_ms, server_ms, time_source, false_start, press_rank)
  values (p_code, v_room.round_number, v_room.lock_epoch, v_player.id, v_player.name, v_elapsed_ms, v_client_ms, v_server_elapsed, v_time_source, v_false_start, v_rank);

  update rooms set last_activity_at = v_now where code = p_code;

  if v_false_start then
    update players set locked_out = true where id = v_player.id;
    return jsonb_build_object('event', 'false_start', 'press', jsonb_build_object('playerName', v_player.name, 'elapsedMs', v_elapsed_ms, 'rank', v_rank, 'falseStart', true));
  end if;

  if v_room.phase = 'open' then
    update rooms set phase = 'locked', lock_window_closes_at = v_now + interval '250 milliseconds' where code = p_code;
    return jsonb_build_object('event', 'first_press', 'press', jsonb_build_object('playerName', v_player.name, 'elapsedMs', v_elapsed_ms, 'rank', v_rank, 'falseStart', false));
  end if;

  return jsonb_build_object('event', 'background_press', 'press', jsonb_build_object('playerName', v_player.name, 'elapsedMs', v_elapsed_ms, 'rank', v_rank, 'falseStart', false));
end;
$function$
