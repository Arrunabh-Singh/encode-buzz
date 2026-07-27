# Scalability & Load Testing Audit

## 1. Database Query Scaling

### 1. Clock Sync: 900 Queries/Minute Hidden Baseline Load
**File:** `lib/clock.ts:4-5,14-28`, `lib/useRoom.ts:80`
**Issue:** Every client fires **5 sequential `server_time_ms()` RPCs every 20 seconds**. For 60 clients: 60 × 5 × 3 = **900 RPC calls per minute**, **54,000 per hour**.
**Impact:** Single largest source of database load. At 50+ concurrent rooms = 46,500 RPCs/min.
**Scale threshold:** Immediate — every client from mount

### 2. 1-Second Poll Creates N+1 Query Storm
**File:** `lib/useRoom.ts:143-147`
**Issue:** Every client runs `setInterval(nudge, 1000)` during active rounds. Each nudge = expire_round_if_due + get_room_state. For 62 clients = 124 QPS. Over 5-min round = 37,200 queries.
**Impact:** Additive with realtime-triggered refreshes. `expire_round_if_due` takes `FOR UPDATE` row lock.
**Scale threshold:** At 3+ rooms (186 clients) = 372 QPS baseline

### 3. State Change Broadcast Amplification
**File:** `lib/useRoom.ts:112-126`
**Issue:** One state_change broadcast = ALL clients re-fetch. 62 clients × 2 queries (room + host state) = up to 64 parallel queries. In steal chain with 5 wrongs = 320 simultaneous queries.
**Impact:** Can exhaust Supabase `max_connections=100` or trigger connection pool queueing.
**Scale threshold:** Immediate — even 1 room with 60 players

### 4. `room_state` View Executes Subquery for Every Row on Every Read
**File:** `get_room_state` RPC (room_state SQL view)
**Issue:** Correlated subqueries for presses + players scan tables for room code. Over 100 rounds, presses table has ~6,000 rows per room. Subqueries become progressively slower.
**Impact:** Read latency increases linearly with rounds played.
**Scale threshold:** Immediate. At 60 players × 100 rounds, cold query can take 50-200ms.

## 2. Resource Contention

### 5. Rate Limiter Is Database Hot-Spot
**File:** `app/api/rpc/[fn]/route.ts:34-41`, `check_rate` RPC
**Issue:** Every API call runs `check_rate` with `FOR UPDATE` + write. 62 clients × ~5 API calls/min = 310 writes/min to rate_limits table.
**Impact:** Write amplification on every request. At 500+ req/s aggregate, becomes bottleneck.
**Scale threshold:** 500+ req/s aggregate

### 6. `record_press` Serializes All Players on Room Row Lock
**File:** `record_press` RPC
**Issue:** `record_press` takes `FOR UPDATE` on room row for entire function duration. 60 players pressing in 250ms queue up sequentially. Player #60 may wait 200-800ms.
**Impact:** Buzzer timing fairness degrades with player count.
**Scale threshold:** Above ~20 players pressing simultaneously

### 7. `get_host_state` Returns Full Round History
**File:** `get_host_state` RPC
**Issue:** Aggregates ALL rounds with `jsonb_agg()`. Over 100 rounds with 60 presses each, response can exceed 500KB-1MB.
**Impact:** Large payloads increase egress, memory, serialization time.
**Scale threshold:** 50+ rounds → noticeable (>200ms). 200+ rounds → unusable.

## 3. Connection & Bandwidth Limits

### 8. Realtime Connection Limit Exhaustion
**File:** `lib/supabaseBrowser.ts`, `lib/useRoom.ts:112`
**Issue:** Each client = 1 WebSocket connection. Room with 62 clients = 62 connections. Supabase Free: 200 max. Pro: 500 max.
**Impact:** 3 rooms on Free = 93% of limit. 8 rooms on Pro = 99% of limit. New connections refused.
**Scale threshold:** 4 rooms (Free), 9 rooms (Pro)

### 9. Bandwidth Consumption per State Change
**Issue:** RoomState ≈ 25-30KB. 64 clients × 30KB = 1.9MB per state transition. Steal chain with 10 changes = 19MB in seconds. Supabase Free: 2GB egress/month.
**Impact:** One intense game session could consume 100-200MB easily.
**Scale threshold:** 2GB/month egress on Free tier

### 10. Client-Side Re-render Storm
**File:** `screens/HostConsole.tsx:70-72`, `screens/PlayerScreen.tsx:308-309`, `screens/DisplayScreen.tsx:22-23`
**Issue:** On every state refresh, all screens re-derive arrays: `activeSorted = [...currentPresses].filter(...).sort(...)`, `scoreboard = [...state.players].sort(...)`. No `useMemo`. Entire PlayerScreen re-renders.
**Impact:** Jank on mid-range phones during rapid state changes.
**Scale threshold:** 30+ players on mid-range devices

## 4. Vercel & Infrastructure Limits

### 11. Vercel Serverless Invocation Quota Exhaustion
**File:** `app/api/rpc/[fn]/route.ts`
**Issue:** Hobby plan: 100,000 invocations/month. One 100-round game with 60 players: 60 × 15 × 100 = 90,000 invocations. Plus clock sync (54,000/hour), polling (37,200/round).
**Impact:** One intense quiz session consumes entire month's Hobby quota.
**Scale threshold:** 1 full game (Hobby), ~10 games (Pro)

### 12. No Connection Pooling
**File:** `lib/supabaseServer.ts`
**Issue:** Singleton pattern works for warm instances but each cold start creates new Supabase client. Vercel serverless functions are ephemeral.
**Impact:** Cold start RPCs slower. No persistent connection pool.
**Scale threshold:** Degraded cold start experience

### 13. `backdrop-filter: blur()` GPU Layer for Every Card
**File:** `app/globals.css:151,270,306`
**Issue:** Every `.card` creates separate GPU compositor layer. 60 player cards × 2 layers = 120 GPU layers on Host Console.
**Impact:** GPU memory exhaustion, compositing slowdown on mobile.
**Scale threshold:** 30+ cards on low-end devices

## 5. Storage & Cleanup

### 14. No Cron Cleanup — Tables Grow Without Bound
**File:** `create_room` RPC
**Issue:** Room cleanup only as side effect of `create_room` when count > 100. If no new rooms created, stale data accumulates. `players`, `presses`, `rounds` grow unboundedly.
**Impact:** Slow queries, larger payloads, increased storage.
**Scale threshold:** ~500 rooms (30,000 players, 60,000 presses)

### 15. `rate_limits` Table Not Auto-Cleaned
**File:** `check_rate` RPC
**Issue:** Each unique IP + bucket creates a row. Stale rows never deleted. 10,000 unique IPs = 10,000+ rows.
**Impact:** Storage bloat over months.
**Scale threshold:** 10,000+ unique IPs

### 16. `presses` Table Grows Without Bound
**Issue:** Each round adds N press rows. No archival or pruning.
**Impact:** Massive table over time, slower queries.
**Scale threshold:** 10,000+ rounds

## Summary: Failure Modes by Scale

| # Clients | Failure |
|-----------|---------|
| 20-30 | Clock sync load becomes noticeable on Free tier |
| 60 (1 room) | record_press serialization causes timing drift, re-fetch storm |
| 120 (2 rooms) | Poll storm: 248 QPS from polling alone |
| 186 (3 rooms) | Realtime connection limit on Free (93%) |
| 500 (8 rooms) | Realtime limit on Pro |
| N/A | Vercel Hobby quota exhausted after 1 intense game |
| 200+ rounds | get_host_state payloads >1MB |

## Highest-Priority Fixes
1. Reduce clock sync frequency to 60s, samples to 3
2. Throttle/debounce refreshState calls
3. Add indexes on `presses(room_code, round_number, false_start, elapsed_ms)`
4. Add cron-based room cleanup (Vercel Cron or pg_cron)
5. Use `useMemo` on sorted arrays in all screens
6. Move rate limiting to Vercel Edge Middleware
