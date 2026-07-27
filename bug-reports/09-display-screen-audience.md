# Display Screen & Public-Facing Audit

## 1. Display Screen — Audience-Facing Bugs

### 1. Invalid Room Code Shows Misleading "Waiting"
**File:** `app/page.tsx:134` → `screens/DisplayScreen.tsx:111-121`
**Bug:** `joinDisplay` sets code with zero validation. `get_room_state` returns null for non-existent room. State stays null, phase defaults to 'idle'. Display perpetually shows "Waiting for players to join…".
**Impact:** Audience sees functional-looking screen implying players should join, but room doesn't exist.
**Likelihood:** High

### 2. "BUZZ!" Shown During Locked Phase With No Winner
**File:** `screens/DisplayScreen.tsx:60-81`
**Bug:** When `phase === 'locked'` but `state.current_winner` is null (all false starts, or 250ms lock window), fallback renders "BUZZ!". Implies buzzers are open but phase is locked.
**Impact:** Audience confused — thinks they should buzz but can't.
**Likelihood:** Medium (250ms window on every locked round)

### 3. No Connection Status Indicator
**File:** `screens/DisplayScreen.tsx:10`
**Bug:** Display Screen does NOT destructure `connected`. If WebSocket drops, state goes completely stale. Display freezes on whatever it last showed.
**Impact:** Audience watches frozen/stale screen with no warning.
**Likelihood:** Medium

### 4. "Locking in…" Indefinitely Stuck
**File:** `screens/DisplayScreen.tsx:65`
**Bug:** Shows `{state.locking_in ? 'Locking in…' : 'Buzzed in'}`. If `expire_round_if_due` fails silently, `locking_in` stays true indefinitely.
**Impact:** Audience sees perpetually "Locking in…" screen. Whole quiz stalls.
**Likelihood:** Low

### 5. BrandFooter Overlap With Scoreboard
**File:** `screens/DisplayScreen.tsx:127-128,139`
**Bug:** Scoreboard: `position: fixed, bottom: 24`. BrandFooter: `position: fixed, bottom: 8`. Only ~16px gap. On short viewports, overlays collide.
**Impact:** Unprofessional visual clash on public audience screen.
**Likelihood:** Medium (6+ scoreboard entries or viewport < ~700px)

### 6. "Round Over" Shown for Aborted Rounds
**File:** `screens/DisplayScreen.tsx:87`
**Bug:** `state?.last_verdict === 'correct' ? 'Correct' : 'Round Over'` — aborted round has `last_verdict=null`, shows "Round Over". Audience can't distinguish normal end from abort.
**Impact:** Audience misled — thinks round ended normally when aborted.
**Likelihood:** High — every aborted round

### 7. QR Code URL Doesn't Include Sub-path Support
**File:** `screens/DisplayScreen.tsx:15`, `screens/HostConsole.tsx:30`
**Bug:** Both hardcode `${globalThis.location.origin}/?room=${code}`. If app deployed at subdirectory (e.g., `/qurious`), both silently break.
**Impact:** QR codes and display links point to wrong URL if not at root.
**Likelihood:** Low (currently at root), but silent failure if changed

### 8. False Starts Invisible to Audience
**File:** `screens/DisplayScreen.tsx:20`
**Bug:** `activePresses.filter((p) => !p.falseStart)` — false starts completely invisible. Audience sees nothing happen. If false starts end round with no winner, audience sees "BUZZ!" → "Round Over — No winner" with no context.
**Impact:** Audience confusion — no activity visible but round ends.
**Likelihood:** High — false starts happen regularly

### 9. No Memoization Causes Unnecessary Re-renders
**File:** `screens/DisplayScreen.tsx:20-21`
**Bug:** `activePresses` and `scoreboard` arrays created fresh on every render. Display re-renders on every broadcast (potentially multiple times/second).
**Impact:** Potential display jank on lower-end TV hardware during critical moments.
**Likelihood:** Medium

### 10. "Waiting for players to join" Flash on Load
**File:** `screens/DisplayScreen.tsx:114-118`
**Bug:** On initial load, `state` is null. `(state?.players.length ?? 0) === 0` is true. Display briefly shows "Waiting for players to join…" even if room has players.
**Impact:** Brief misleading message on public screen when connecting to existing game.
**Likelihood:** High — every display refresh/reconnect

### 11. Scoreboard Visible During Active Buzzer Rounds
**File:** `screens/DisplayScreen.tsx:123,127`
**Bug:** Scoreboard shown during ALL phases except countdown — including open and locked. Audience watches scores update in real-time during steal rounds.
**Impact:** Spoils competitive tension. Players still in round see score change before answering.
**Likelihood:** Always — by design, but questionable for competitive play

## 2. Host Console — Critical Bugs

### 12. Unhandled Promise Rejection on Judge Click While Disconnected
**File:** `screens/HostConsole.tsx:176-180` → `lib/useRoom.ts:334-341`
**Bug:** Judge buttons call `void judge(verdict)`. If network down, `fetch` throws → unhandled rejection. Host sees no error feedback.
**Impact:** Host clicks "Correct" or "Wrong", nothing happens, no error shown. May click repeatedly.
**Likelihood:** High — every judge click during connectivity blip

### 13. All `void`-wrapped RPC Calls Silently Fail on Disconnect
**File:** `screens/HostConsole.tsx:136,145,155,212`, `lib/useRoom.ts:302-304,343-352`
**Bug:** `startRound`, `abortRound`, `nextRound`, `updateSettings` all `void`-wrapped async RPCs. Any network failure => unhandled rejection.
**Impact:** Silent failures on critical round control buttons.
**Likelihood:** High during any network instability

### 14. "End Session" Has No Confirmation
**File:** `screens/HostConsole.tsx:86`
**Bug:** Clicking "End Session" immediately clears session, wipes localStorage, navigates to lobby. No confirmation dialog. If accidentally clicked during live quiz, host loses room entirely (can't rejoin as host).
**Impact:** Catastrophic — accidental click destroys host session irreversibly.
**Likelihood:** Medium — button prominent in header next to others

### 15. Team PINs Visible to Anyone Looking at Host Screen
**File:** `screens/HostConsole.tsx:110-115`
**Bug:** Team login PINs rendered in large cyan monospace font in visible grid. If host screen is visible to players (projector mirror, hybrid setup), all team PINs exposed.
**Impact:** In competitive quiz, players could join as other teams and sabotage.
**Likelihood:** Medium — common setup where host laptop visible to audience

### 16. Can Start Round With Zero Players
**File:** `screens/HostConsole.tsx:68`
**Bug:** When `requireReadyCheck` is false, `canStart` is always true, even with 0 players. Host triggers countdown no one can participate in.
**Impact:** Useless countdown animation on display screen.
**Likelihood:** Medium

### 17. No Optimistic UI Feedback After Judge Click
**File:** `screens/HostConsole.tsx:176-181`
**Bug:** No immediate visual feedback after host clicks judge button. UI only updates on next broadcast. If RPC slow (>500ms), host may click again.
**Impact:** Host confusion, potential duplicate judging.
**Likelihood:** Medium on slow networks

## 3. Both Screens — Shared Issues

### 18. No "Loading" vs "Empty State" Distinction
**File:** `screens/HostConsole.tsx:58-63`, `screens/DisplayScreen.tsx:111-121`
**Bug:** Both screens use same UI for "not yet fetched" and "fetched but empty". Can't distinguish transient loading from permanent missing data.
**Impact:** Can't tell if initializing or broken.
**Likelihood:** High — every initial load

### 19. "------" Shown as Room Code Before Code Set
**File:** `screens/DisplayScreen.tsx:31`
**Bug:** Before code set, display shows `'------'`. Combined with empty QR code area (guarded by `if (!code) return`), top-right card shows empty QR spot with "------" as code.
**Impact:** Unprofessional look. Audience may try typing "------" as room code.
**Likelihood:** High on every page load

### 20. Teams Modal Allows Duplicate Names
**File:** `screens/HostConsole.tsx:381,224`
**Bug:** `names = text.split('\n').map(n => n.trim()).filter(Boolean)` — no deduplication. Duplicate team names cause React duplicate key warnings and incorrect reconciliation.
**Impact:** UI glitches in roster.
**Likelihood:** Low

## Summary Table

| # | Screen | Severity | Description |
|---|--------|----------|-------------|
| 1 | Display | Critical | Invalid room code shows "Waiting for players" permanently |
| 2 | Display | High | "BUZZ!" shown during locked phase with no winner |
| 3 | Display | High | No connection indicator — stale state is invisible |
| 4 | Display | Medium | "Locking in…" can hang indefinitely |
| 5 | Display | Medium | BrandFooter visually collides with scoreboard |
| 6 | Display | Medium | Aborted rounds labeled "Round Over" — no distinction |
| 7 | Display | Low | QR URL hardcodes root path |
| 8 | Display | Medium | False starts invisible to audience |
| 9 | Display | Low | No memoization, re-allocates arrays every render |
| 10 | Display | Medium | "Waiting for players" flash on every reconnect |
| 11 | Display | Medium | Scoreboard visible during active buzzer rounds |
| 12 | Host | Critical | Unhandled rejection on judge click while disconnected |
| 13 | Host | High | All void-wrapped RPC calls silently fail on disconnect |
| 14 | Host | High | "End Session" has no confirmation |
| 15 | Host | Medium | Team PINs visible to anyone looking at host screen |
| 16 | Host | Low | Can start round with zero players |
| 17 | Host | Medium | No optimistic UI feedback after judge click |
| 18 | Both | Medium | No "loading" vs "empty/error" state distinction |
| 19 | Display | Low | "------" shown as room code before code is set |
| 20 | Host | Low | No duplicate team name validation |
