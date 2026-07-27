# Security & Adversarial Threat Model

## 1. Critical Vulnerabilities

### 1. Service-Role Key in Environment — Full DB Compromise
**File:** `.env.local`
**Description:** `SUPABASE_SERVICE_ROLE_KEY` is stored in plaintext. Anyone with filesystem access to the dev machine or deployed environment gets full admin access to the Supabase project — bypass all RLS, execute arbitrary SQL, drop tables, read all secrets.
**Impact:** Complete database compromise — read/write all rooms, player secrets, host secrets, press data, scores.
**Severity:** Critical
**Likelihood:** Medium

### 2. Host Secret Privilege Escalation
**File:** Database RPCs (`start_round`, `judge_round`, `abort_round`, `next_round`, `update_settings`, `define_teams`, `get_host_state`)
**Description:** All host-only RPCs authenticate via `p_host_secret`. The host secret is 128 bits (32 hex chars). While brute force is infeasible, if the secret is ever exposed (logged, leaked via error messages, localStorage theft), an attacker gains full host control.
**Severity:** Critical
**Likelihood:** Low

### 3. Unhandled Rejection on judge — Host Confusion
**File:** `lib/useRoom.ts:334-341`
**Description:** When network fails on `judge_round` click, `rpc()` throws and it's an unhandled rejection. Host sees no feedback.
**Severity:** Critical (round stuck scenario)
**Likelihood:** Medium

---

## 2. High Severity

### 4. X-Forwarded-For Rate Limit Bypass
**File:** `app/api/rpc/[fn]/route.ts:33`
**Description:** `req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'` — attacker can cycle through spoofed IPs to reset rate-limit buckets. Enables unlimited PIN brute force.
**Severity:** High
**Likelihood:** Medium

### 5. PIN Brute Force — Distributed Attack
**File:** `app/api/rpc/[fn]/route.ts:50-53`
**Description:** PIN space is 10,000 (4 digits). Per-IP limit: 5/min. Per-room limit: 30/min. With XFF bypass or botnet of 200 IPs, attacker can try all 10,000 PINs in ~5.5 hours. No progressive lockout or alerting.
**Severity:** High
**Likelihood:** Medium

### 6. TeamLogin Leaks Player Secret in Response
**File:** `app/api/rpc/[fn]/route.ts:59-63`
**Description:** `team_login` returns `{ name, secret }` in cleartext over HTTPS. If intercepted (compromised CA, MitM), attacker can call all player-authorized RPCs forever.
**Severity:** High
**Likelihood:** Low

### 7. Clock Sync Timing Cheat — 150ms Advantage
**File:** `lib/clock.ts:36-38`, `record_press` RPC
**Description:** Client computes `offsetMs` in a module variable. Attacker can modify via DevTools. The drift tolerance allows claiming a time up to ~120ms in the past. Attacker script can call `record_press` with `p_client_estimated_server_ms = serverTime - 100` (pretending 100ms earlier).
**Severity:** High
**Likelihood:** High

### 8. Client Timing Parameter Manipulation
**File:** `record_press` RPC
**Description:** `p_rtt_ms` max validated at 400. If attacker sends `p_rtt_ms = 400` and `p_client_estimated_server_ms = serverTime - 100`, the past tolerance window is `least(400/2 + 20, 120) = 120ms`. Attacker gets 100ms advantage.
**Severity:** High
**Likelihood:** High

### 9. Realtime Channel Eavesdropping
**File:** `lib/useRoom.ts:112-118`
**Description:** `supabaseBrowser.channel('room:${code}')` subscribes to a public, non-private Realtime channel. No `realtime_authorize()` function exists. Anyone with the anon key and a room code can subscribe and silently watch all game activity.
**Severity:** Medium
**Likelihood:** High

---

## 3. Medium Severity

### 10. Room Enumeration via SECURITY DEFINER RPC
**File:** `get_room_state` RPC
**Description:** `get_room_state` is `SECURITY DEFINER` and callable with any room code — it's a "does this room exist?" oracle. Attacker can brute-force 7,200 codes/hour.
**Severity:** Medium
**Likelihood:** Medium

### 11. Room Table DoS (100 Room Limit)
**File:** `create_room` RPC
**Description:** Room cleanup only happens as side effect of `create_room` when count exceeds 100. Attacker calls `create_room` 100 times from different IPs → fills room table → legitimate users see "Server full" for up to 2 hours.
**Severity:** Medium
**Likelihood:** Medium

### 12. Missing CSRF Protection
**File:** `app/api/rpc/[fn]/route.ts:26`
**Description:** Route accepts POST with no CSRF tokens, Origin checks, or SameSite cookies. Sessions are in localStorage (not cookies), so standard CSRF doesn't apply, but combined with any XSS, attacker reads localStorage and calls any RPC.
**Severity:** Medium
**Likelihood:** Low

### 13. No RLS Defense-in-Depth
**File:** Database tables
**Description:** All tables have RLS enabled but zero policies. Defense-in-depth is missing — single RPC bug = full data exposure.
**Severity:** Medium
**Likelihood:** Low

### 14. Room Capacity Race Condition
**File:** `join_room` RPC
**Description:** `join_room` checks `SELECT count(*) FROM players` and rejects if >= 60. Two concurrent calls with 59 players both read 59, both insert — 61 players created.
**Severity:** Low
**Likelihood:** Low

---

## 4. Full Attack Surface Summary

| # | Vulnerability | Severity | Likelihood |
|---|--------------|----------|-----------|
| 1 | Service-role key exposure | Critical | Medium |
| 2 | Host secret privilege escalation | Critical | Low |
| 3 | Unhandled rejection on judge | Critical | Medium |
| 4 | X-Forwarded-For bypass | High | Medium |
| 5 | PIN brute force (distributed) | High | Medium |
| 6 | Player secret MitM interception | High | Low |
| 7 | Clock sync timing cheat | High | High |
| 8 | Client timing parameter manipulation | High | High |
| 9 | Realtime channel eavesdropping | Medium | High |
| 10 | Room enumeration | Medium | Medium |
| 11 | Room table DoS (no cleanup) | Medium | Medium |
| 12 | Missing CSRF protection | Medium | Low |
| 13 | Missing RLS policies (defense depth) | Medium | Low |
| 14 | Room capacity race condition | Low | Low |
| 15 | Name change impersonation | Low | Low |
| 16 | Room code modulo bias | Low | Low |
| 17 | expire_round_if_due authorization | Low | Low |
| 18 | Player name XSS (React-escaped) | Low | Low |
