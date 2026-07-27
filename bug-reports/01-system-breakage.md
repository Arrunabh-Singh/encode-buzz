# System Breakage & Reliability Audit

## 1. STATE MANAGEMENT BREAKAGE

### 1. `locking_in` deadlock — no error recovery in `nudge` pipeline
**File:** `lib/useRoom.ts:128-133`, `lib/useRoom.ts:143-147`
**Description:** `nudge()` calls `expire_round_if_due` via `.then(refreshState)` with **no `.catch()`**. If the RPC errors (network blip, Postgres contention), `refreshState` is never called. The round phase stays `locked` with `locking_in=true` indefinitely. The 1s poll keeps calling `nudge` but the error is silently swallowed every cycle.
**Impact:** Round permanently stuck. Host must abort.
**Likelihood:** Medium

### 2. Timer overshoot with skewed clock
**File:** `lib/time.ts:3-4`, `lib/useRoom.ts:152-153,161-162`
**Description:** `remainingMs` clamps to `Math.max(0, ...)`, so `setTimeout(nudge, 0 + 30)` is fine. But if clock sync is **negatively skewed** (client clock behind server), `remainingMs` returns a positive value even after the server deadline has passed — the timer fires late. The 1s poll masks this for delays ≤1s, but compounded drift across multiple sync failures (e.g., Supabase timeout) could delay round transitions by many seconds.
**Impact:** Round transitions perceptibly delayed, "stuck" feeling.
**Likelihood:** Low

### 3. Host closes tab mid-round — unjudgeable state
**File:** `lib/useRoom.ts:334-341`, `screens/HostConsole.tsx:176-181`
**Description:** Only the host can call `judge_round`. If the host tab closes while phase is `locked` (winner waiting for Correct/Wrong/No Answer verdict), no client can advance the round. The `expire_round_if_due` RPC might auto-resolve after `round_timeout_seconds`, but if steal mode is enabled and the host needs to judge each stealer, or if round timeout is 0 (no limit), the round is **permanently stuck**.
**Impact:** Session bricked — even a new host tab can't recover because `get_session` validates the old host secret and the original host is gone.
**Likelihood:** Medium

### 4. State set to null on failed RPC — silent UI crash
**File:** `lib/useRoom.ts:69-70`
**Description:** `refreshState` sets `setState((data as RoomState | null) ?? null)` — if `get_room_state` returns null/undefined, state becomes `null`. On `HostConsole.tsx:58`, if `!state`, it renders "Setting up your room…" forever. All timer effects (poll, exact one-shots, countdown ticker) are gated on `state?.phase` — they stop firing entirely. The app enters an unrecoverable blank state.
**Impact:** Room appears broken, user must refresh.
**Likelihood:** Low (null data unlikely unless Supabase schema changes)

### 5. `wonRef` never resets if phase skips `ended`
**File:** `screens/PlayerScreen.tsx:74-80`
**Description:** `wonRef.current` resets only when `phase !== 'ended'`. If the server transitions from `locked` directly to `idle` (via `abort_round` during a steal chain), `wonRef` stays `true` and the victory sound never plays again for that player in future rounds.
**Impact:** Audio desync for that player's future wins.
**Likelihood:** Low

### 6. Notification: No heartbeat or liveness check for host
**File:** Global
**Description:** There is no mechanism to detect that the host has disconnected. If the host's tab closes, no other client can promote to host. The `abortRound` and `judge` actions are host-only.
**Impact:** Unrecoverable if host disconnects mid-round with no timeout.
**Likelihood:** Medium

### 7. Notification: Timer-based state machine relies on at least one active client
**File:** `lib/useRoom.ts:128-174`
**Description:** The entire round advancement mechanism (poll + one-shot timers) runs in client `useEffect`s. If all clients close their tabs (TV display, all players, host), the Supabase server has no internal scheduler to advance rounds. The room is frozen until someone reconnects.
**Impact:** Room appears dead on reconnection until the next client's poll fires.
**Likelihood:** Low-Moderate

---

## 2. API/SERVER BREAKAGE

### 8. Unhandled promise rejection in session restoration
**File:** `lib/useRoom.ts:87-101`
**Description:** The IIFE calls `rpc('get_session', ...)` which **throws** on HTTP error status (`rpc.ts:8`). No `.catch()` on the IIFE. If the API route is down (cold start, Supabase outage), this is an **unhandled promise rejection**. The stale `localStorage` session is NOT cleared, and on subsequent page reloads the same rejection occurs.
**Impact:** User is trapped in a loop — always redirected to lobby but session never cleared. Must manually clear localStorage.
**Likelihood:** Medium

### 9. `rpc` throws propagate as unhandled rejections across all host actions
**File:** `lib/useRoom.ts:304,337,344,351`, `lib/rpc.ts:8`
**Description:** `updateSettings`, `judge`, `abortRound`, `nextRound` are all `void rpc(...)` — no await, no catch. If the network is down or Supabase returns 500, the throw from `rpc.ts:8` is an unhandled rejection. `showError` is never called.
**Impact:** Silent failures on critical actions. Settings appear saved but aren't.
**Likelihood:** Medium

### 10. RPC functions exposed via anon key bypass rate limiting
**File:** `lib/useRoom.ts:69,130`, `lib/clock.ts:16`
**Description:** `get_room_state`, `expire_round_if_due`, and `server_time_ms` are called directly from the browser via `supabaseBrowser.rpc()` using the **anon key** — they bypass the API route's 120 req/min rate limiter entirely. An attacker can spam these endlessly.
**Impact:** Unbounded direct-to-Supabase calls, potential abuse/denial-of-wallet.
**Likelihood:** High (trivial to exploit)

### 11. `expire_round_if_due` is callable by anyone with a room code
**File:** `lib/useRoom.ts:130`
**Description:** Called via anon key with only `p_code` — no secret required. Anyone who knows a room code can advance round timers (if the Postgres function doesn't properly validate timing).
**Impact:** Malicious player could manipulate round timing.
**Likelihood:** Medium (depends on server-side validation strength)

---

## 3. CLIENT-SIDE BREAKAGE

### 12. `pointerHandledRef` stuck in `true` state
**File:** `screens/PlayerScreen.tsx:183-193`
**Description:** If `pointerdown` fires but `click` is suppressed (browser bug, gesture cancellation, touch-scroll interrupt), `pointerHandledRef` stays `true` forever. The next genuine press is silently dropped.
**Impact:** Press silently dropped once, then player sees "no response" when tapping.
**Likelihood:** Low

### 13. Keyboard listener effect runs on every render — stale closure risk
**File:** `screens/PlayerScreen.tsx:195-206`
**Description:** No dependency array means add/remove on every render. It's a performance footgun.
**Impact:** Event listener churn on every render.
**Likelihood:** Low

### 14. AudioContext created but never closed
**File:** `screens/PlayerScreen.tsx:11-14`
**Description:** `new AudioContext()` creates a native resource. Never calls `.close()`. On component remount, the old context leaks.
**Impact:** Gradual memory leak over very long sessions.
**Likelihood:** Low

### 15. Corrupted localStorage session persists indefinitely
**File:** `lib/useRoom.ts:25-32`
**Description:** `loadSession` catches JSON parse errors and returns `null`, but does **not** clear the corrupted data. The user is sent to the lobby, but the bad data remains. A refresh triggers the same failure.
**Impact:** Corrupted session blocks auto-join permanently until manual clear.
**Likelihood:** Low

---

## 4. DATA INTEGRITY

### 16. `exportResults` crashes on null `hostDetail` (disabled prop evaluation)
**File:** `screens/HostConsole.tsx:236`
**Description:** Expression `!hostDetail?.roundHistory.length` — if `hostDetail` is `null`, optional chaining makes `undefined.length` which throws a **TypeError** every render when `hostDetail` is null.
**Impact:** React error boundary triggers; Export button and surrounding section may not render.
**Likelihood:** High (every render before first hostDetail fetch completes)

### 17. Score sync race — state.players vs hostDetail.roundHistory
**File:** `lib/useRoom.ts:355`, `screens/HostConsole.tsx:72`
**Description:** `myPlayer` and `scoreboard` derive from `state.players` (anon key RPC). Points awarded come from `hostDetail.roundHistory` (host secret RPC). These are separate RPCs — if one fetch is slower, scores and round history briefly disagree.
**Impact:** Transient inconsistency in score display (≤1s).
**Likelihood:** Medium
