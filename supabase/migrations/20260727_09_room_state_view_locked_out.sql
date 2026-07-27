-- Found live during verification: a locked-out player (judged 'wrong' in
-- reopen-remaining, or false-started) sees an active, enabled buzzer during
-- 'open' — locked_out was never exposed on room_state, so the client had no
-- way to know. Pressing does nothing (the server silently returns
-- 'ignored'), which reads as a dead button.
create or replace view public.room_state as
 select code,
        case
            when phase = 'countdown'::text and clock_timestamp() >= opens_at then 'open'::text
            else phase
        end as phase,
    round_number,
    settings,
    opens_at,
    round_deadline_at,
    lock_window_closes_at,
    entry_mode,
    phase = 'locked'::text and lock_window_closes_at is not null and clock_timestamp() < lock_window_closes_at as locking_in,
    coalesce(current_winner,
        case
            when phase = 'locked'::text and lock_window_closes_at is not null and clock_timestamp() >= lock_window_closes_at then ( select p.player_name
               from presses p
              where p.room_code = r.code and p.round_number = r.round_number and p.lock_epoch = r.lock_epoch and p.false_start = false
              order by p.elapsed_ms, p.created_at
             limit 1)
            else null::text
        end) as current_winner,
    winners,
    last_verdict,
    last_points_awarded,
    ( select coalesce(jsonb_agg(jsonb_build_object('playerName', p.player_name, 'elapsedMs', p.elapsed_ms, 'rank', p.press_rank, 'falseStart', p.false_start, 'lockEpoch', p.lock_epoch) order by p.press_rank), '[]'::jsonb) as "coalesce"
           from presses p
          where p.room_code = r.code and p.round_number = r.round_number) as presses,
    ( select coalesce(jsonb_agg(jsonb_build_object('name', pl.name, 'score', pl.score, 'connected', true, 'ready', pl.ready, 'lockedOut', pl.locked_out) order by pl.created_at), '[]'::jsonb) as "coalesce"
           from players pl
          where pl.room_code = r.code and (r.entry_mode = 'open'::text or pl.secret is not null)) as players,
    lock_epoch
   from rooms r;
