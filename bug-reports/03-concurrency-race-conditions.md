# Race Conditions & Concurrency Analysis

## 1. Critical — First-Press Guarantee Broken

### 1.1 Simultaneous Press — No `SELECT FOR UPDATE`
**File:** `record_press` RPC (inferred), `app/api/rpc/[fn]/route.ts:59`
**Race:** Two `record_press` RPCs run concurrently at READ COMMITTED isolation. Both read `phase = 'open'`, both decide they are first, both write `phase = 'locked'`. The last writer overwrites `current_winner`. Player B's transaction can commit AFTER player A's, silently stealing the round.
**Impact:** Wrong player declared winner when 2+ press within microseconds.
**Likelihood:** High

### 1.2 READ COMMITTED — First-Press Guarantee Cannot Be Enforced
**File:** All Postgres RPCs
**Race:** All RPCs run at default READ COMMITTED. Two concurrent `record_press` calls: TX1 reads `phase='open'`, TX2 reads `phase='open'`. TX1 writes `phase='locked', current_winner='A'`. TX2 writes `phase='locked', current_winner='B'`. Both commit. B wins even though A's transaction ran first.
**Impact:** Wrong winner declared.
**Likelihood:** High

---

## 2. State Transition Races

### 2.1 Double-start_round — Two Host Calls Same Instant
**File:** `lib/useRoom.ts:309-313`, `start_round` RPC
**Race:** Host clicks "Start Round" twice rapidly, or two host tabs both call `start_round`. Both RPCs read `phase='idle'` simultaneously. Both transition to 'countdown'. The second overwrites the first's `opens_at`, `round_number`.
**Impact:** `round_number` increments by 2, countdown clock resets to the second call's value. Round corruption.
**Likelihood:** Medium

### 2.2 judge_round vs. next_round Interleaving
**File:** `judge_round` and `next_round` RPCs
**Race:** TX1 (judge_round) reads phase='locked', starts awarding points. TX2 (next_round) reads phase='locked', sets phase='idle', clears presses/winners. TX1 commits its point award to a now-idle round. Points awarded with no winner shown.
**Impact:** Ghost points with no audit trail.
**Likelihood:** Low

### 2.3 abort_round + record_press Concurrent
**File:** `abort_round` and `record_press` RPCs
**Race:** TX1 (abort_round) reads phase, sets to 'ended'. TX2 (record_press) reads phase at same time, sees 'open' or 'locked', records a press. TX2 commits after TX1. Final state: phase='ended' (from abort), but a press is recorded for an aborted round.
**Impact:** Orphaned press in aborted round history.
**Likelihood:** Low

### 2.4 expire_round_if_due + judge_round Double-Score
**File:** `lib/useRoom.ts:128-133`, `judge_round` RPC
**Race:** At T=round_deadline: TX1 (expire_round_if_due) sees phase='locked', is_due=true, transitions to 'ended'. TX2 (judge_round) also sees phase='locked', awards points, sets phase='ended'. If both commit, points awarded in a "timed out" round.
**Impact:** Points awarded in expired round.
**Likelihood:** Low

### 2.5 start_round + record_press at Same Instant
**File:** `start_round` and `record_press` RPCs
**Race:** TX1 (start_round) reads phase='idle', sets to 'countdown'. TX2 (record_press) reads phase='idle' (TX1 hasn't committed yet). TX2 rejects the press ("round not active"). Even though the press happened the instant the round started.
**Impact:** Player sees press rejected despite pressing at right time.
**Likelihood:** Low

---

## 3. Realtime Propagation Races

### 3.1 Broadcast → stale read due to replication lag
**File:** `lib/useRoom.ts:114-116`, `lib/useRoom.ts:65-71`
**Race:** Supabase Realtime listens via WAL. If the RPC reads from a replica that hasn't applied the WAL yet, the state returned is stale. The client's `setState` overwrites correct state with stale data.
**Impact:** UI shows incorrect phase/winners until next poll.
**Likelihood:** Medium

### 3.2 Broadcasts arrive out of order on reconnecting clients
**File:** `lib/useRoom.ts:107-126`
**Race:** Client disconnects briefly. During disconnect: state changes A (open→locked), B (locked→ended). Client reconnects, might receive B first, then A. `setState` first shows 'ended', then shows 'locked'.
**Impact:** UI flickers to wrong state temporarily.
**Likelihood:** Medium

### 3.3 Missed broadcast — no replay mechanism
**File:** `lib/useRoom.ts:118-121` (subscribe handler)
**Race:** Client's Realtime subscription drops. Client sets `connected=false`. State changes are missed. When subscription reconnects, it doesn't replay missed messages.
**Impact:** Client is stuck on old state for up to 1 second.
**Likelihood:** Medium

---

## 4. Clock Sync + Press Timing Races

### 4.1 Clock sync runs DURING round — offset changes mid-round
**File:** `lib/clock.ts:44-51`, `lib/clock.ts:36-38`
**Race:** At T=0, syncClock sets offsetMs=+50ms. At T=2s, another syncClock sets offsetMs=-30ms. `getServerNow()` instantly jumps by 80ms. Countdown display jumps. Exact one-shot timer fires 80ms early or late.
**Impact:** Countdown display glitches. Timer fires off by up to 100ms.
**Likelihood:** Medium

### 4.2 Stale RTT on first press (clock sync hasn't completed)
**File:** `lib/clock.ts:8`, `lib/useRoom.ts:80`
**Race:** `useEffect(() => startClockSync(), [])` fires on mount. `startClockSync()` is fire-and-forget. If user presses before first `server_time_ms` RPC completes, `lastRttMs=0` and `offsetMs=0`. `getServerNow()` returns unadjusted `Date.now()`.
**Impact:** First buzzer press has unreliable timing.
**Likelihood:** Medium

### 4.3 Player clock manipulation for ~150ms advantage
**File:** `lib/clock.ts`, `record_press` RPC
**Race:** Player sets device clock backward by RTT/2 + 150ms. drift check passes tolerance. Player appears 150ms faster than reality.
**Impact:** Unfair advantage in buzzer race.
**Likelihood:** High

### 4.4 Clock sync race in countdown — batch collection window
**File:** `lib/clock.ts:24-34`
**Race:** `syncClock()` takes 5 sequential calls (~250-1000ms total). During collection, `offsetMs` is not updated. If round starts during this window, offset is stale.
**Impact:** Brief window where clock is unsynced during critical round timing.
**Likelihood:** Low

---

## 5. Poll + Timer + Visibility Catch-Up Interactions

### 5.1 Triple nudge thundering herd
**File:** `lib/useRoom.ts:143-147,149-164,168-174`
**Race:** At the exact moment a round expires, 1s poll + exact one-shot + visibility change handler can all fire within the same event-loop tick. 3× RPC calls per client. With 32 clients = 96 simultaneous RPCs.
**Impact:** Database load spike at every phase transition.
**Likelihood:** Medium

### 5.2 Timer fires after phase transitioned — redundant expire + stale refresh
**File:** `lib/useRoom.ts:149-164`
**Race:** 1s poll fires at T=999, phase transitions. Exact one-shot fires at T=1000, calls nudge (no-op), then refreshState (redundant setState).
**Impact:** Redundant setState triggers unnecessary re-render.
**Likelihood:** High

### 5.3 +30ms margin makes exact timer late
**File:** `lib/useRoom.ts:153,162`
**Race:** `remainingMs()` returns 0. Code schedules `setTimeout(0+30=30ms)`. Browser setTimeout minimum clamping (4ms). Exact timer fires 30ms AFTER round opens.
**Impact:** Exact timer is always 30ms later than actual transition.
**Likelihood:** Medium

---

## 6. Client-Side State Inconsistencies

### 6.1 myPlayer stale during phase transitions
**File:** `lib/useRoom.ts:355`
**Race:** `myName` set immediately on join, but `state.players` only updates after broadcast + refreshState (~200-500ms). During window, `myPlayer` is null.
**Impact:** Flash of wrong UI on join/rename.
**Likelihood:** Low

### 6.2 hasPressed stale until broadcast round-trip — no optimistic update
**File:** `screens/PlayerScreen.tsx:59,116-121`
**Race:** Player presses buzzer. Local state shows nothing. `hasPressed` still false. Buzzer still shows "BUZZ" instead of "IN" until broadcast returns.
**Impact:** Player may press again, thinking first press didn't register.
**Likelihood:** Medium

### 6.3 isMyTurn laggy
**File:** `screens/PlayerScreen.tsx:60`
**Race:** Server sets `current_winner` immediately, but client sees it only after broadcast+refreshState (~200-500ms). Player doesn't see turn confirmed.
**Impact:** User confusion, potential double-press.
**Likelihood:** Medium

### 6.4 "Won" sound race — wonRef resets incorrectly
**File:** `screens/PlayerScreen.tsx:74-80`
**Race:** If state briefly flicks from 'ended' to intermediate and back (out-of-order broadcasts), `wonRef.current = false` resets, win sound replays.
**Impact:** Double win-sound playback.
**Likelihood:** Low
