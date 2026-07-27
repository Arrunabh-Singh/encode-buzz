-- Advisor-flagged: presses.player_id has an FK to players but no covering
-- index. Every steal-mode "next fastest, not locked out" lookup in
-- judge_round joins presses to players on this column, and it backs the FK
-- cascade delete when a room/player is removed.
create index if not exists idx_presses_player_id on public.presses (player_id);
