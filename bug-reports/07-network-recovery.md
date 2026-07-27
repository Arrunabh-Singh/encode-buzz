# Network Failure & Recovery Audit

## 1. Connection Lifecycle Failures

### 1.1 Slow WebSocket Connect (30s+)
**File:** `lib/useRoom.ts:107-126`, `screens/PlayerScreen.tsx:167`
**Description:** During 30s WebSocket connect, `connected` remains false. User sees "reconnecting" — can't press buzzer. 1s poll timer still fires.
**Impact:** Player locked out of pressing for up to 30s.
**Likelihood:** Moderate on flaky networks

### 1.2 Disconnect Detection Latency (60-120s)
**File:** `lib/useRoom.ts:118-121`
**Description:** Browser may not fire WebSocket `onclose` for 60-120s after actual network loss (TCP keepalive defaults). `connected` remains `true`. Silent failure window.
**Impact:** Silent failure for up to 2 minutes.
**Likelihood:** Medium

### 1.3 Vercel Cold Start on First RPC
**File:** `supabaseServer.ts:7-20`, `route.ts:59`
**Description:** Cold instance must create new Supabase client (~50-200ms). Multiple clients hitting cold instances simultaneously each wait independently.
**Impact:** Added latency on first RPC after deployment scale-down.
**Likelihood:** Low on sustained traffic, high after idle

### 1.4 Supabase Completely Down
**File:** All RPC calls
**Description:** No graceful degradation — all game logic lives in Postgres RPCs. All RPC calls fail. User sees "Connection lost" banners with no recovery path.
**Impact:** Total game halt.
**Likelihood:** Rare

## 2. Request Failures & Recovery

### 2.1 `record_press` Fails Silently — No Retry, No Feedback
**File:** `lib/useRoom.ts:315-332`
**Description:** If `rpc('record_press', ...)` throws, error is UNCAUGHT. No `.catch()`, no `showError`, no retry. Press lost forever.
**Impact:** Lost buzzes, unfair game outcomes.
**Likelihood:** High on flaky connections

### 2.2 `leave_room` Fire-and-Forget Loss
**File:** `lib/useRoom.ts:261`
**Description:** If network fails, leave operation silently fails. Player's session remains on server. Ghost player accumulates.
**Impact:** Ghost players in rooms.
**Likelihood:** Moderate

### 2.3 `update_settings` Fire-and-Forget Loss
**File:** `lib/useRoom.ts:304`
**Description:** If network fails, host thinks settings saved but they weren't. No error shown.
**Impact:** Host confusion, game proceeds with old settings.
**Likelihood:** Moderate

### 2.4 `abort_round` / `next_round` Unhandled Rejections
**File:** `lib/useRoom.ts:345-346,351-352`
**Description:** Called with `void`. If fetch fails, unhandled rejection. No error surfacing.
**Impact:** Round may hang; host sees no feedback.
**Likelihood:** Moderate

### 2.5 `get_session` IIFE Uncaught Rejection → Infinite Loop
**File:** `lib/useRoom.ts:87-101`
**Description:** No `.catch()`. Stale localStorage session NOT cleared. On next refresh, same failure repeats. **User permanently stuck.**
**Impact:** User locked out until manual localStorage clear.
**Likelihood:** Moderate

### 2.6 `refreshState` / `get_room_state` No Error Handling
**File:** `lib/useRoom.ts:69-70`
**Description:** On RPC failure, `data` is null, `setState(null)` wipes current state. Entire UI flashes blank on transient failure.
**Impact:** UI blank flash on transient RPC failure.
**Likelihood:** High

### 2.7 `expire_round_if_due` Fire-and-Forget, No Error Check
**File:** `lib/useRoom.ts:130-132`
**Description:** If RPC fails, nudge silently swallowed. Round could get permanently stuck.
**Impact:** Round stuck in countdown or locking_in state.
**Likelihood:** Low under normal load

### 2.8 No Retry Logic Anywhere
**File:** All RPC calls, `rpc.ts:1-10`, `clock.ts:16`
**Description:** Zero retry logic in entire codebase. Every RPC fires once and either succeeds or fails permanently.
**Impact:** Any transient failure is fatal.
**Likelihood:** Certain on any non-trivial deployment

### 2.9 Rapid State Transitions During Network Blip
**File:** `PlayerScreen.tsx:58-85`
**Description:** Client misses broadcasts, then jumps to latest state. Skipped UI animations, audio cues.
**Impact:** Disorienting UX, missed audio/visual cues.
**Likelihood:** High

## 3. Reconnection Storm / Thundering Herd

### 3.1 32+ Clients Simultaneously Reconnect
**File:** `lib/useRoom.ts:109-110,130-132`, `lib/clock.ts:45-46`
**Description:** After 30s outage: 32 WebSocket reconnections + 32 get_room_state + 32 expire_round_if_due + 32 get_host_state + 32 server_time_ms = ~128-160 simultaneous RPCs.
**Impact:** Database connection pool saturation.
**Likelihood:** High if Supabase experiences brief blips

### 3.2 No Exponential Backoff for Reconnection
**File:** `lib/useRoom.ts:145`
**Description:** Poll timer fires every second regardless of previous success. No backoff during sustained issues.
**Impact:** Continuous RPC traffic worsens congestion.
**Likelihood:** Certain during Supabase instability

### 3.3 No Jitter on Reconnection
**File:** Supabase client default behavior
**Description:** All clients reconnect at same instant. Requests gang up.
**Impact:** Request spikes amplify database load.
**Likelihood:** High

## 4. Race Between WebSocket Reconnect and HTTP RPC

### 4.1 Stale State Window After Reconnect
**File:** `lib/useRoom.ts:107-126`
**Description:** After reconnect: `connected=true` fires, but broadcast handler only fires on NEXT `state_change`. Player sees "reconnecting" disappear and can attempt to press based on stale state.
**Impact:** Player may press when round already ended (false start penalty risk).
**Likelihood:** High during reconnection

### 4.2 Race Between Overlapping `refreshState` Calls
**File:** `lib/useRoom.ts:65-71`
**Description:** `refreshState` called from multiple paths without deduplication. Stale response can overwrite fresh one.
**Impact:** UI may show older state after newer was already displayed.
**Likelihood:** High under latency

## 5. Session Recovery After Network Loss

### 5.1 Stale Session Loop on Refresh During Outage
**File:** `lib/useRoom.ts:87-101`
**Description:** Network failure → promise rejects → no `.catch()` → `saveSession(null)` never reached. On next refresh, same failure loops.
**Impact:** Users permanently stuck, must manually clear localStorage.
**Likelihood:** Moderate

### 5.2 `checkEntryMode` No Error Handling
**File:** `lib/useRoom.ts:12-15`, `page.tsx:111-119`
**Description:** On network error, returns null. Caller interprets as "room not found". Shows no error.
**Impact:** Valid room code typed during network blip silently fails.
**Likelihood:** High during network issues

## 6. Vercel Serverless Specific

### 6.1 No Timeout on Client-Side Fetch
**File:** `lib/rpc.ts:2`
**Description:** `fetch()` with no `AbortSignal` can hang indefinitely.
**Impact:** UI freezes waiting for RPC response.
**Likelihood:** Low

### 6.2 Rate Check Adds Latency to Every Request
**File:** `app/api/rpc/[fn]/route.ts:34-41`
**Description:** Every request calls `check_rate` first. For `record_press` during buzzer race, extra 10-50ms latency matters.
**Impact:** Added latency on buzzer presses.
**Likelihood:** Always

### 6.3 `x-forwarded-for` May Not Always Be Populated
**File:** `app/api/rpc/[fn]/route.ts:33`
**Description:** Users behind same NAT share an IP — rate limits apply to all.
**Impact:** Legitimate users behind NAT get 429.
**Likelihood:** Low on Vercel, moderate with proxies

## 7. Supabase-Specific Issues

### 7.1 Anon-Key RPC Calls Not Rate-Limited by App
**File:** `lib/useRoom.ts:13,69,130`, `lib/clock.ts:16`
**Description:** `get_room_state`, `expire_round_if_due`, `server_time_ms` bypass API route rate limiter.
**Impact:** Malicious user hammers these without hitting rate limit.
**Likelihood:** Moderate

### 7.2 `server_time_ms` Polling Scales Linearly
**File:** `lib/clock.ts:44-51`
**Description:** Every client calls `server_time_ms` every 20s (5 samples). 32 clients = 8 RPCs/sec. 100 concurrent users = 25 RPCs/sec.
**Impact:** Moderate baseline DB load.
**Likelihood:** Always

## 8. Browser-Specific Network Issues

### 8.1 Background Tab Throttling
**File:** `lib/useRoom.ts:143-174`
**Description:** Chrome limits `setInterval` to 1/min in backgrounded tabs. `visibilitychange` catches on foreground, but locked phone for 30s+ misses nudge.
**Impact:** Rounds stuck until foregrounded.
**Likelihood:** High on mobile

### 8.2 WebSocket Throttling in Background Tabs
**File:** `lib/useRoom.ts:107-126`
**Description:** Chrome throttles WebSocket messages in background tabs. Broadcast handler may not fire promptly. Queued state changes fire on return.
**Impact:** Stale state during tab switch, burst of RPCs on return.
**Likelihood:** High

## Summary of Critical Network Issues

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | `record_press` failure silent — no retry, no feedback | Lost buzzes, unfair games | Medium |
| 2 | `get_session` IIFE has no `.catch()` — infinite refresh loop | Users permanently stuck | Trivial |
| 3 | `refreshState` overwrites state on error — UI flicker | Blank UI flashes | Trivial |
| 4 | No retry logic on any RPC call | Every transient failure permanent | Medium |
| 5 | Stale state window after WebSocket reconnect | Player may buzz at wrong time | Medium |
| 6 | Background tab timer throttling stalls round progression | Rounds stuck until foreground | Medium |
| 7 | Race condition on overlapping `refreshState` calls | State can regress to older version | Trivial |
| 8 | `leave_room`/`update_settings` fire-and-forget | Ghost players, silent data loss | Trivial |
| 9 | Rate check adds 10-30ms latency to buzzer presses | Competitive fairness impact | Low |
| 10 | Disconnect detection takes 60-120s | Silent failure window | Medium |
