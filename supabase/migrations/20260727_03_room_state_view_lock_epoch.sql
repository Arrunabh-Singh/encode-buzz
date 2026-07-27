-- R8: expose lock_epoch (room-level) and lockEpoch (per press) so the
-- client can tell whether a given press belongs to the current buzz window
-- or a prior one. Without this, "reopen-remaining" steal mode's epoch bump
-- is invisible to the client, and a player who already pressed in an
-- earlier epoch appears to still be blocked in the new one.
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
    ( select coalesce(jsonb_agg(jsonb_build_object('name', pl.name, 'score', pl.score, 'connected', true, 'ready', pl.ready) order by pl.created_at), '[]'::jsonb) as "coalesce"
           from players pl
          where pl.room_code = r.code and (r.entry_mode = 'open'::text or pl.secret is not null)) as players,
    lock_epoch
   from rooms r;
