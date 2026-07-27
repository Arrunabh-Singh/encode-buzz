# Client-Side & Edge Case Analysis

## 1. Mobile & Touch Device Issues

### 1.1 iOS Safari AudioContext on first user interaction
**File:** `screens/PlayerScreen.tsx:8-44`
**Description:** The `AudioContext` created outside a user-gesture handler is "suspended" on iOS. `resume()` is fire-and-forget — if the promise rejects, error is swallowed. `playBuzz()` triggered by `hasPressed` change is in a `useEffect` — **not** a gesture handler. iOS Safari will mute the sound silently.
**Devices:** iOS Safari
**Impact:** Buzzer sound never plays on iOS
**Likelihood:** High

### 1.2 300ms tap delay on iOS Safari for `<button>`
**File:** `components/Buzzer.tsx:40-48`
**Description:** No `touch-action: manipulation` on the buzzer button CSS. On iOS, this can cause `pointerHandledRef` guard to skip legitimate taps because `onPointerDown` fires later.
**Devices:** iOS Safari
**Impact:** Dead taps — ~300ms perceived lag
**Likelihood:** Medium

### 1.3 `dvh` (dynamic viewport height) — Safari 15.4+ only
**File:** `screens/PlayerScreen.tsx:209`
**Description:** `minHeight: '100dvh'` — Safari introduced `dvh` in 15.4 (2022). iPhones stuck on iOS 15.3 (iPhone 6s) see invalid `dvh`.
**Devices:** Older iOS Safari, older Chrome Android
**Impact:** Page content collapses vertically
**Likelihood:** Medium

### 1.4 iOS Private Browsing localStorage
**File:** `lib/useRoom.ts:34-41`
**Description:** `localStorage.setItem` throws in iOS private browsing. `saveSession` silently fails — session never persists. User gets no indication.
**Impact:** Session never restores on refresh (graceful degradation)
**Likelihood:** Low

### 1.5 Screen orientation change during active round
**File:** `screens/PlayerScreen.tsx:209-323`
**Description:** Orientation change causes viewport resize and frame drops. `countdownRemainingMs` uses 100ms intervals — orientation change can delay timers.
**Impact:** Brief visual stutter during round
**Likelihood:** Medium

---

## 2. Browser Compatibility

### 2.1 `backdrop-filter` GPU heavy on low-end devices
**File:** `app/globals.css:151,214,270,306`
**Description:** `.card` and `.buzzer-btn` use `backdrop-filter: blur(26px) saturate(170%)`. Combined with 3 animated orbs with `filter: blur(90-110px)` creates severe frame drops on low-end Android devices.
**Devices:** Low-end Android, older iPads
**Impact:** Janky animations, broken backdrop-filter rendering
**Likelihood:** High

### 2.2 `cqw` (container query unit) — browser support limitations
**File:** `screens/PlayerScreen.tsx:107,113,119,124,137,150`
**Description:** CSS `cqw` supported in Chrome/Edge 105+, Firefox 110+, Safari 16.2+. Users on older browsers see `clamp()` fallback to first value only.
**Devices:** Browsers before 2023
**Impact:** Text smaller but not broken
**Likelihood:** Low

### 2.3 Scrollbar styling WebKit-only
**File:** `app/globals.css:114-116`
**Description:** `::-webkit-scrollbar` pseudo-elements ignored by Firefox.
**Devices:** Firefox
**Impact:** Default scrollbar instead of styled one (cosmetic)
**Likelihood:** Low

---

## 3. Network & Offline Behavior

### 3.1 No service worker — app unusable offline
**Description:** No service worker registered. Full page refresh while offline → white screen.
**Impact:** Complete loss of functionality on refresh
**Likelihood:** Medium

### 3.2 `rpc.ts` fetch has no timeout
**File:** `lib/rpc.ts:1-9`
**Description:** `fetch()` with no `AbortSignal` can hang indefinitely if network is in half-open state.
**Impact:** Buzzer becomes unresponsive, user can't tell if press went through
**Likelihood:** Medium

### 3.3 `record_press` fire-and-forget — silent failure mid-buzz
**File:** `lib/useRoom.ts:315-332`, `screens/PlayerScreen.tsx:96`
**Description:** `press()` calls `rpc('record_press', ...)` as `void`. If RPC fails, `press()` returns normally. User sees ripple animation but press never reached server.
**Impact:** User thinks they buzzed in but they didn't
**Likelihood:** High

### 3.4 Realtime WebSocket disconnect — `connected` state desync
**File:** `lib/useRoom.ts:112-126`
**Description:** After Realtime reconnects, state isn't re-fetched until next broadcast. Gap between reconnection and next broadcast has stale state.
**Impact:** Stale state briefly after reconnect
**Likelihood:** Medium

### 3.5 `refreshState` errors are completely silent
**File:** `lib/useRoom.ts:65-71`
**Description:** `refreshState` doesn't check for errors — `setState((data as RoomState | null) ?? null)` just sets null.
**Impact:** Silent state staleness
**Likelihood:** Medium

---

## 4. Concurrent User Actions

### 4.1 User spams buzzer button rapidly
**File:** `components/Buzzer.tsx:42-45`, `screens/PlayerScreen.tsx:183-193`
**Description:** No debounce on buzzer. Rapid presses queue up multiple RPCs. Web Audio API's `tone()` fires multiple times.
**Impact:** Multiple RPCs sent, overlapping sounds
**Likelihood:** Medium

### 4.2 User changes name WHILE round in progress
**File:** `screens/PlayerScreen.tsx:99-103`
**Description:** `changeName` callable anytime (no phase guard). After name change, `myPlayer` is null until next broadcast.
**Impact:** `hasPressed`/`isMyTurn` wrong until next state refresh
**Likelihood:** Medium

### 4.3 User leaves and rejoins mid-round
**File:** `lib/useRoom.ts:259-271,203-217`
**Description:** `leaveRoom()` resets all state. Between leave and rejoin, user misses current state. Subscription cleanup fires.
**Impact:** Brief desync on rejoin
**Likelihood:** Medium

### 4.4 Two users with same name
**File:** `lib/useRoom.ts:355`
**Description:** `state?.players.find((p) => p.name === myName)` — with duplicate names, `find` returns only first match.
**Impact:** Wrong player selected for UI, React duplicate key warning
**Likelihood:** Low

### 4.5 User refreshes during countdown
**File:** `app/page.tsx:121-138`, `lib/useRoom.ts:83-102`
**Description:** After session restore, initial state fetch is async. By the time state is fetched, countdown may already be over.
**Impact:** Countdown display may start late or not at all
**Likelihood:** High

---

## 5. React-Specific Issues

### 5.1 Keyboard handler runs on every render (no dependency array)
**File:** `screens/PlayerScreen.tsx:195-206`
**Description:** `useEffect` for keyboard handler has NO dependency array. Event listener churned on every render. React 19 concurrent mode causes rapid mount/unmount.
**Impact:** Event listener churn, potential memory leak in dev strict mode
**Likelihood:** High

### 5.2 `useRoom` returns new object literal every render
**File:** `lib/useRoom.ts:357-383`
**Description:** `return { connected, role, code, myName, ... }` — new object every render. Every consumer re-renders on any state change.
**Impact:** Unnecessary re-renders, poor performance on low-end devices
**Likelihood:** High

### 5.3 countdown timer effect can restart mid-countdown on state refresh
**File:** `lib/useRoom.ts:178-188`
**Description:** Effect depends on `state?.opens_at` (string). If state is re-fetched during countdown, `opens_at` string reference changes, effect cleanup + restart runs.
**Impact:** Countdown could jump or restart
**Likelihood:** Low

---

## 6. Accessibility Issues

### 6.1 `aria-live="polite"` wraps too much content
**File:** `screens/PlayerScreen.tsx:226-260`
**Description:** `aria-live` wraps name editing + playing-as display. State changes trigger screen reader announcement of entire region.
**Impact:** Verbose/confusing announcements
**Likelihood:** Medium

### 6.2 Focus management on modal open/close
**File:** `screens/HostConsole.tsx:281-293,367-379`
**Description:** Focus restoration uses `document.activeElement` on mount. Query selector may miss most logical first focus target.
**Impact:** Focus could land on wrong element
**Likelihood:** Medium

### 6.3 Color contrast on glassmorphic UI
**File:** `app/globals.css:147-153`
**Description:** `.card` uses transparent gradients + `backdrop-filter`. White text over glowing background elements can drop below 4.5:1 WCAG AA.
**Impact:** Hard-to-read text over certain backgrounds
**Likelihood:** Medium

---

## 7. Browser-Specific

### 7.1 Safari Intelligent Tracking Prevention
**File:** `lib/useRoom.ts:17-41`
**Description:** Safari ITP can delete localStorage after 7 days of no interaction.
**Impact:** Occasional unexpected session loss
**Likelihood:** Low

### 7.2 Back-forward cache (bfcache)
**Description:** When user navigates back, page restored from bfcache without running JS. `onpageshow` not listened to. State could be stale.
**Impact:** Stale data shown briefly after back navigation
**Likelihood:** Medium

### 7.3 Mobile browser tab discarding
**Description:** Chrome/Safari aggressively discard background tabs under memory pressure. On restore, page reloads completely. User misses entire round.
**Impact:** Miss the round, reconnection delay
**Likelihood:** Medium

### 7.4 Safari backdrop-filter + transform rendering artifacts
**File:** `app/globals.css:147-153,284-327`
**Description:** Elements with `backdrop-filter` + animated `transform` can show "ghost" of background at previous position.
**Impact:** Visual artifacts during buzzer press animation
**Likelihood:** Medium
