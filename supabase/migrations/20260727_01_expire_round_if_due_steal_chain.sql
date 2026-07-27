-- R5 (part 1/2): a winner awaiting judgment is an active decision in
-- progress, not a stalled round — don't auto-expire it out from under the
-- host mid-steal-chain. Each judging step gets its own fresh deadline (see
-- the judge_round migration), so this carve-out only matters for the very
-- first decision right after a press.
create or replace function public.expire_round_if_due(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_room rooms%rowtype; v_now timestamptz := clock_timestamp(); v_winner text;
begin
  select * into v_room from rooms where code = p_code for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  if v_room.phase = 'countdown' and v_now >= v_room.opens_at then
    update rooms set phase = 'open' where code = p_code;
    v_room.phase := 'open';
  end if;

  if v_room.phase = 'locked' and v_room.current_winner is null and v_room.lock_window_closes_at is not null
     and v_now >= v_room.lock_window_closes_at then
    select player_name into v_winner from presses
    where room_code = p_code and round_number = v_room.round_number and lock_epoch = v_room.lock_epoch and false_start = false
    order by elapsed_ms asc, created_at asc limit 1;
    if v_winner is not null then
      update rooms set current_winner = v_winner where code = p_code;
      v_room.current_winner := v_winner;
    end if;
  end if;

  if v_room.phase in ('open','locked') and v_room.round_deadline_at is not null and v_now >= v_room.round_deadline_at
     and not (v_room.phase = 'locked' and v_room.current_winner is not null) then
    perform finish_round(p_code, null, '[]'::jsonb);
    return jsonb_build_object('ok', true, 'expired', true);
  end if;

  return jsonb_build_object('ok', true, 'expired', false);
end;
$function$
