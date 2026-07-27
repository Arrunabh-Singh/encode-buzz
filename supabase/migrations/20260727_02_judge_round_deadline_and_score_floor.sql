-- R5 (part 2/2): extend round_deadline_at every time the steal chain
-- advances or reopens, so each new judging/buzzing opportunity gets a fresh
-- time budget instead of sharing one fixed window with every prior step in
-- the chain.
-- R6: floor a wrong-answer penalty at zero and report the delta actually
-- applied, so the host's end-of-round summary stays truthful.
create or replace function public.judge_round(p_code text, p_host_secret text, p_verdict text)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_room rooms%rowtype;
  v_winner_name text;
  v_presser presses%rowtype;
  v_player players%rowtype;
  v_points_awarded jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_next presses%rowtype;
  v_pts integer;
  v_new_score integer;
  v_timeout_s integer;
  v_next_deadline timestamptz;
begin
  if p_verdict not in ('correct','wrong','no_answer') then
    return jsonb_build_object('error', 'Invalid verdict');
  end if;

  select * into v_room from rooms where code = p_code for update;
  if not found or v_room.host_secret != p_host_secret then
    return jsonb_build_object('error', 'Not the host');
  end if;
  if v_room.phase != 'locked' then
    return jsonb_build_object('error', 'No press to judge');
  end if;
  if v_room.lock_window_closes_at is not null and v_now < v_room.lock_window_closes_at then
    return jsonb_build_object('error', 'Still locking in');
  end if;

  v_winner_name := v_room.current_winner;
  if v_winner_name is null then
    select player_name into v_winner_name from presses
    where room_code = p_code and round_number = v_room.round_number and lock_epoch = v_room.lock_epoch and false_start = false
    order by elapsed_ms asc, created_at asc limit 1;
    if v_winner_name is not null then
      update rooms set current_winner = v_winner_name where code = p_code;
    end if;
  end if;

  if v_winner_name is null then
    return jsonb_build_object('error', 'No press to judge');
  end if;

  select * into v_presser from presses
  where room_code = p_code and round_number = v_room.round_number and player_name = v_winner_name and false_start = false
  order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('error', 'No press to judge');
  end if;

  select * into v_player from players where id = v_presser.player_id;
  v_timeout_s := (v_room.settings->>'roundTimeoutSeconds')::integer;

  if p_verdict = 'correct' then
    if v_player.id is not null then
      v_pts := (v_room.settings->>'pointsPerCorrect')::integer;
      update players set score = score + v_pts where id = v_player.id;
      v_points_awarded := jsonb_build_array(jsonb_build_object('player', v_player.name, 'delta', v_pts));
    end if;
    update rooms set winners = array_append(winners, v_winner_name) where code = p_code;
    return finish_round(p_code, 'correct', v_points_awarded);
  end if;

  if p_verdict = 'wrong' then
    if v_player.id is not null then
      update players set locked_out = true where id = v_player.id;
      v_pts := (v_room.settings->>'pointsPenaltyWrong')::integer;
      if v_pts > 0 then
        update players set score = greatest(score - v_pts, 0) where id = v_player.id returning score into v_new_score;
        v_points_awarded := jsonb_build_array(jsonb_build_object('player', v_player.name, 'delta', v_new_score - v_player.score));
      end if;
    end if;

    if v_room.settings->>'stealMode' = 'off' then
      return finish_round(p_code, 'wrong', v_points_awarded);
    end if;

    v_next_deadline := case when v_timeout_s > 0 then v_now + (v_timeout_s || ' seconds')::interval else null end;

    if v_room.settings->>'stealMode' = 'next-fastest' then
      select pr.* into v_next
      from presses pr join players pl on pl.id = pr.player_id
      where pr.room_code = p_code and pr.round_number = v_room.round_number
        and pr.lock_epoch = v_room.lock_epoch and pr.false_start = false and not pl.locked_out
      order by pr.elapsed_ms asc limit 1;
      if found then
        update rooms set current_winner = v_next.player_name, round_deadline_at = v_next_deadline where code = p_code;
        return jsonb_build_object('ok', true);
      end if;
      return finish_round(p_code, 'wrong', v_points_awarded);
    end if;

    -- reopen-remaining: fresh buzz window for whoever's left, not locked out.
    -- lock_epoch bumps so record_press's dedupe check doesn't block a re-buzz.
    if not exists (select 1 from players where room_code = p_code and not locked_out) then
      return finish_round(p_code, 'wrong', v_points_awarded);
    end if;
    update rooms set current_winner = null, phase = 'open', lock_window_closes_at = null, lock_epoch = lock_epoch + 1,
      round_deadline_at = v_next_deadline
    where code = p_code;
    return jsonb_build_object('ok', true);
  end if;

  return finish_round(p_code, 'no_answer', v_points_awarded);
end;
$function$
