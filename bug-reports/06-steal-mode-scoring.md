# Steal Mode & Scoring Logic Audit

## 1. Steal Mode Chain Breakage

### 1. No way to distinguish judged from unjudged pressers in UI
**File:** `screens/HostConsole.tsx:70`, `lib/types.ts:17-22`
**Description:** `SafePress` type has no `judged` or `eliminated` field. During `next-fastest` steal chain, after judging Player A 'wrong', Player A's press remains in the list. The press order display still shows them as `#1 PlayerA`. The host has no visual indication of which pressers remain eligible.
**Impact:** Host confusion mid-chain; may judge eliminated player again or lose track.
**Likelihood:** Certain (every next-fastest chain)

### 2. `activeSorted[0]` always references fastest presser, not current stealer
**File:** `screens/HostConsole.tsx:168-172`
**Description:** After judgment advances to 2nd fastest player, `current_winner` correctly updates, but `activeSorted[0]` still shows original fastest presser's elapsedMs. Timing subtext shows wrong player's stats.
**Impact:** Misleading timing info for host.
**Likelihood:** Certain (every steal transition)

### 3. Server crash if next-fastest presser has left the room
**File:** `lib/types.ts:24-28`
**Description:** `SafePress` stores `playerName`, not player ID. If rank-2 player disconnected after pressing, server attempts to deduct/award points to a name that no longer exists in `players[]`.
**Impact:** Server error, round may get stuck in 'locked'.
**Likelihood:** Moderate

### 4. Single-presser round with steal mode 'next-fastest' leaves no stealer
**File:** `screens/HostConsole.tsx:177-179`
**Description:** Button reads "Wrong (steal)" with only one presser. Server has no next-fastest to advance to. If server doesn't handle empty-remaining-pressers, round locks up.
**Impact:** Potential stuck round.
**Likelihood:** Moderate

### 5. No upper bound on steal chain length
**File:** `screens/HostConsole.tsx:177-179`
**Description:** Judge can keep clicking "Wrong" cycling through pressers. Without "already judged" tracking, infinite loop possible.
**Impact:** Round never ends, scores tank.
**Likelihood:** Low

## 2. Reopen-remaining Edge Cases

### 6. False-started players permanently blocked in reopened phase
**File:** `screens/PlayerScreen.tsx:59`
**Description:** `hasPressed` checks `state.presses.some(p => p.playerName === myName)` with no filter on `falseStart`. False-started player can't press in reopened phase because their false-start press exists in `presses[]`.
**Impact:** False starters unfairly excluded from steals.
**Likelihood:** Certain (every reopen-remaining round with false starts)

### 7. New players joining during reopened phase can buzz in
**File:** `screens/PlayerScreen.tsx:59,180`
**Description:** Player who joins after initial open has no entry in `presses[]`, so `hasPressed` is false. They can press in reopened phase — answering a question they never saw the initial buzzer period for.
**Impact:** Unfair advantage.
**Likelihood:** Moderate

### 8. Judged 'wrong' player could press again if server clears presses
**File:** `screens/PlayerScreen.tsx:59,180`
**Description:** If `judge_round` removes 'wrong' player's press from `presses[]` when reopening, `hasPressed` becomes false, allowing them to buzz in again.
**Impact:** Same player penalized then answers same question.
**Likelihood:** Unknown (server-dependent)

## 3. Score Manipulation

### 9. No idempotency on `judge_round` — double-click awards double points
**File:** `lib/useRoom.ts:334-341`, `lib/rpc.ts:10`
**Description:** No loading state disabling buttons. Double-click sends two RPCs. If server doesn't deduplicate, player receives 2× points.
**Impact:** Score corruption.
**Likelihood:** Moderate

### 10. Network error on `judge` is silently swallowed
**File:** `lib/useRoom.ts:334-341`
**Description:** No try/catch. Network failure causes unhandled rejection. Round remains in 'locked' state indefinitely.
**Impact:** Round permanently stuck.
**Likelihood:** Low

### 11. Score can go negative with no floor
**File:** `lib/types.ts:11`, `screens/HostConsole.tsx:72`
**Description:** `pointsPenaltyWrong` ranges 0-20. Player with score < penalty goes negative. No floor check visible.
**Impact:** Negative scores displayed.
**Likelihood:** Certain

### 12. `last_points_awarded` overwritten or accumulated mid-chain
**File:** `screens/HostConsole.tsx:207-211`, `lib/types.ts:44`
**Description:** In next-fastest mode with multiple wrong verdicts, points awarded behavior mid-chain is ambiguous.
**Impact:** Inaccurate end-of-round points summary.
**Likelihood:** Uncertain (server-dependent)

## 4. Host Console Display During Steal Chain

### 13. `last_verdict` semantically ambiguous during steal chains
**File:** `screens/HostConsole.tsx:201-206`
**Description:** After "A wrong → B wrong → exhausted", `last_verdict`='wrong'. `current_winner` might be null. Message "Marked wrong, no more stealers" with `current_winner` as dash.
**Impact:** Minor display confusion.
**Likelihood:** Certain (exhausted steal chains)

### 14. "MISSED / no presses" shown when all stealers were wrong
**File:** `screens/PlayerScreen.tsx:141-147`
**Description:** When all pressers were wrong, `last_verdict` is not 'correct'. Fallback shows "MISSED / no presses" — factually incorrect. Players who pressed see "MISSED".
**Impact:** Players who participated see a lie.
**Likelihood:** Certain (all-wrong steal outcomes)

## 5. Phase Transition During Steals

### 15. Round timeout may fire mid-steal-chain
**File:** `lib/useRoom.ts:143-147`
**Description:** 1s poll fires `expire_round_if_due` while phase='locked' (steal chain). If `round_deadline_at` not reset per steal, timer expires mid-chain.
**Impact:** Round ends prematurely mid-steal.
**Likelihood:** Moderate

### 16. Race between `judge_round` and `abort_round`
**File:** `lib/useRoom.ts:334-347`
**Description:** Both fire-and-forget, no locking. Points could be awarded then round aborted (or vice versa).
**Impact:** Round ends in unexpected state.
**Likelihood:** Low

### 17. `expire_round_if_due` can't distinguish active steal chain from stale lock
**File:** `lib/useRoom.ts:128-133`
**Description:** `expire_round_if_due` only checks `round_deadline_at` without checking for unjudged pressers. Treats active steal chain as stale locked round.
**Impact:** Active round terminated during judgment.
**Likelihood:** Moderate

## 6. Concurrency Issues

### 18. Two host tabs call `judge_round` with conflicting verdicts
**File:** `lib/useRoom.ts:334-341`
**Description:** No mechanism prevents multiple host sessions. Two tabs each send different verdicts. Server processes both — award and penalty both applied.
**Impact:** Score corruption, indeterminate state.
**Likelihood:** Low

### 19. Player press during verdict-to-reopen transition window
**File:** `lib/useRoom.ts:315-332,334-341`
**Description:** In reopen-remaining mode: during transition from 'locked' to 'open', player's `record_press` may be accepted or rejected depending on timing.
**Impact:** Unfair buzz acceptance or rejection.
**Likelihood:** Low

## Summary Table

| # | Severity | Area | Bug |
|---|----------|------|-----|
| 1 | High | next-fastest | No `judged` field on `SafePress`; all pressers shown as eligible |
| 2 | Medium | next-fastest | `activeSorted[0]` misattributed during steals |
| 3 | High | next-fastest | No skip logic if next-fastest player left |
| 4 | High | next-fastest | Single presser with steal mode has no next player |
| 5 | Medium | next-fastest | No upper bound on steal chain length |
| 6 | Medium | reopen | False-started players blocked in reopened phase |
| 7 | Medium | reopen | New joiner can buzz mid-round |
| 8 | High | reopen | Judged 'wrong' player could press again if server clears presses |
| 9 | High | scoring | No idempotency on judge_round |
| 10 | Critical | scoring | Network error on judge is silently swallowed |
| 11 | Medium | scoring | No score floor; negative scores possible |
| 15 | High | phase | Round timeout may fire mid-steal-chain |
| 16 | High | concurrency | judge_round + abort_round race |
| 17 | High | phase | expire_round_if_due can't distinguish active steal from stale |
| 18 | Critical | concurrency | Dual host tabs send conflicting verdicts |
