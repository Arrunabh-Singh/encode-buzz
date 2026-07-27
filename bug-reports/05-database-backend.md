# Database & Backend Logic Audit

## 1. Transaction & Consistency Issues

### 1. `record_press` lacks atomicity across phase check, false-start check, duplicate check, insert, and room-state update
**Description:** Two simultaneous presses can both pass the phase='open' check and both insert. The second press could win when the first should have locked.
**Impact:** Wrong winner declared
**Likelihood:** High

### 2. `judge_round` and `record_press` race: press recorded after round is judged
**Description:** Under READ COMMITTED, a simultaneously executing `record_press` that read phase='open' before `judge_round` committed will still insert its press. Round_history won't include it.
**Impact:** Inconsistent scores
**Likelihood:** High

### 3. `start_round` and `expire_round_if_due` race
**Description:** If `start_round` sets phase='countdown' and `expire_round_if_due` concurrently reads phase='countdown' and sees `opens_at < now()`, it could prematurely expire the round.
**Impact:** Round immediately expires after being set up
**Likelihood:** Medium

## 2. Concurrency in Postgres

### 4. No `SELECT ... FOR UPDATE` or advisory lock around critical sections
**Description:** `record_press`, `judge_round`, `start_round` — without row-level locking, all races above are possible. Postgres snapshot isolation means concurrent transactions see a consistent snapshot at start.
**Impact:** Root cause of all press/judge race conditions
**Likelihood:** High

### 5. `check_rate` not atomic — read-then-write without locking
**Description:** Two concurrent calls can both read `count < limit`, both increment, both pass.
**Impact:** 2× intended rate allowed
**Likelihood:** Medium

### 6. Postgres default `READ COMMITTED` — phantoms possible
**Description:** A press inserted by concurrent transaction after your read but before your write is a phantom — invisible at read time but committed before write.
**Impact:** Inconsistent state across concurrent operations
**Likelihood:** High

## 3. Data Integrity

### 7. Scores can go negative
**Description:** If `pointsPenaltyWrong >= current_score`, score becomes negative. No `CHECK (score >= 0)` constraint evident.
**Impact:** Negative scores displayed
**Likelihood:** High

### 8. Player names may not be unique within a room
**Description:** `judge_round` looks up winner by name. Duplicate names could update wrong row or throw error.
**Impact:** Judging applies to wrong player
**Likelihood:** Medium

### 9. No check preventing `round_number` from going backwards
**Description:** If `next_round` doesn't increment monotonically, round history ordering breaks.
**Impact:** Round history corruption
**Likelihood:** Low

### 10. `define_teams` mid-round orphans press data
**Description:** If teams are redefined while round is in progress, current round's press records reference reassigned names.
**Impact:** Scoring logic becomes incoherent
**Likelihood:** Medium

### 11. Duplicate press records possible without composite unique constraint
**Description:** Without `UNIQUE (room_code, round_number, player_name)`, same player appears multiple times in press list.
**Impact:** Rank logic and point calculation broken
**Likelihood:** Medium

## 4. Edge Cases in Timer/Expiry

### 12. If no client ever calls `expire_round_if_due`, round hangs forever
**Description:** No automatic server-side cron job exists. Round stays in 'countdown' or 'open' indefinitely.
**Impact:** Round permanently stuck
**Likelihood:** High

### 13. `opens_at` in future, round abandoned — no cleanup
**Description:** Host starts countdown but disconnects. Room stuck in phase='countdown' with `opens_at` in future. No one calls `expire_round_if_due` because condition not met.
**Impact:** Room frozen forever
**Likelihood:** Medium

### 14. `lock_window_closes_at` is NULL when no press occurs
**Description:** `expire_round_if_due` must handle NULL `lock_window_closes_at` — without NULL handling, it could prematurely expire.
**Impact:** Incorrect expiry behavior
**Likelihood:** Medium

### 15. Round timeout = 0 (no limit) vs. negative values
**Description:** If timeout=0 (no limit), infinite-wait scenarios. If negative, immediate expiry.
**Impact:** Room hangs or immediately expires
**Likelihood:** Low

## 5. Resource Leaks

### 16. Old rooms never garbage-collected
**Description:** Rooms accumulate forever. Only cleanup is side effect of `create_room` when count > 100.
**Impact:** Unbounded table growth
**Likelihood:** High

### 17. `presses` table grows without bound
**Description:** Each round adds N press rows. No archival or pruning.
**Impact:** Massive table over time, slow queries
**Likelihood:** High

### 18. Rate limiter entries never purged
**Description:** Old rate limit windows never deleted.
**Impact:** Storage bloat
**Likelihood:** Medium

### 19. `round_history` grows unbounded
**Description:** Every finished round appends a row. No archival or pruning.
**Impact:** Growing storage, slower queries
**Likelihood:** High

## 6. Rate Limiter Correctness

### 20. `check_rate` likely fixed-window, not sliding window
**Description:** At window boundary, player can burst 2× limit by making requests right at reset.
**Impact:** 2× intended rate at window boundaries
**Likelihood:** High

### 21. Rate limiter doesn't distinguish critical vs. non-critical operations
**Description:** `record_press` and `create_room` may use same bucket or same limit.
**Impact:** Creating rooms could exhaust rate limit for buzzer pressing
**Likelihood:** Medium

## 7. Input Validation Gaps

### 22. `p_verdict` accepts arbitrary values
**Description:** If verdict is 'something_else', CASE WHEN may fall through without awarding/penalizing, leaving round inconsistent.
**Impact:** Inconsistent state
**Likelihood:** Medium

### 23. `p_patch` allows arbitrary JSON key overwrites
**Description:** If `update_settings` uses `settings || p_patch` (merge), host could set `phase` or other protected fields.
**Impact:** Host could inject protected field values
**Likelihood:** Medium

### 24. `p_team_names` can be huge array
**Description:** 10,000 team names could cause OOM or create millions of player rows. No max-length check.
**Impact:** DoS / resource exhaustion
**Likelihood:** Medium

### 25. `p_new_name` has no length validation
**Description:** 10MB string stored as player name. Index bloat, UI overflow.
**Impact:** Database bloat, display issues
**Likelihood:** Medium

### 26. Weak PINs not rejected for team mode
**Description:** PIN '0000' or '1234' is trivially guessed.
**Impact:** Easy PIN brute force
**Likelihood:** Medium

## 8. Session Secret Analysis

### 27. `get_session` leaks existence of valid codes
**Description:** Response differs between "room not found" and "secret doesn't match".
**Impact:** Room enumeration
**Likelihood:** Medium

## 9. Score & Judging Integrity

### 28. A player can be judged twice for the same round
**Description:** If `judge_round` doesn't check phase or have idempotency, host can call it multiple times.
**Impact:** Double score awarded/deducted
**Likelihood:** High

### 29. All players false-start: round may have no valid presses
**Description:** If all presses are false starts, round enters answered phase with no valid winner. Judge can't proceed.
**Impact:** Game deadlock
**Likelihood:** Medium

### 30. Penalty deduction can create negative scores
**Description:** No `GREATEST(score - penalty, 0)` guard.
**Impact:** Negative scores
**Likelihood:** High

### 31. Steal-mode: after 'wrong', next player's buzzer not auto-opened
**Description:** If `judge_round` doesn't update phase back to 'open', steal mechanic doesn't work.
**Impact:** Steal mode broken
**Likelihood:** High

### 32. `record_press` doesn't validate client timestamp reasonableness
**Description:** Malicious player submits fabricated timestamps.
**Impact:** Fabricated press times accepted
**Likelihood:** Medium

### 33. False start detection may be purely client-driven
**Description:** If `record_press` trusts client's `false_start` flag without server-side verification.
**Impact:** False start bypass
**Likelihood:** Medium
