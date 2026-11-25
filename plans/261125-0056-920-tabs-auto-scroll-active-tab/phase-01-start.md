---
phase: 1
title: "Phase 1: Core Hook & Horizontal Scroll Geometry (TDD)"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Core Hook & Horizontal Scroll Geometry (TDD)

## Goal

Implement and thoroughly unit-test the shared horizontal-only active-tab scrolling helper (`computeActiveTabScrollLeft`, `prefersReducedMotion`) and React hook (`useScrollActiveTab`) in `@teacher-os/ui`.

## Files to Create / Modify

- Create: `packages/ui/src/hooks/use-scroll-active-tab.test.tsx`
- Create: `packages/ui/src/hooks/use-scroll-active-tab.ts`

## Requirements

<!-- Updated: Red-Team Review - add defensive containment/finite/NaN/try-catch guards, instant scroll behavior, isomorphic layout effect, webfont ready & dynamic label realignment, smooth scroll cancellation, rAF coalesced ResizeObserver, and accurate tsconfig/biome gates -->
- Compute minimal `inline: "nearest"` horizontal target `scrollLeft` inside a `role="tablist"` scroll container using `getBoundingClientRect()`, `clientLeft`, `clientWidth`, `scrollWidth`, and computed horizontal padding (`paddingLeft`/`paddingRight`).
- Defensive boundary guards in `computeActiveTabScrollLeft(container, activeTab)`:
  - Return `null` if `!container.contains(activeTab)`.
  - Return `null` if `maxScrollLeft = container.scrollWidth - container.clientWidth <= 0`.
  - Return `null` if container or active tab rect width `<= 0` (hidden/unmeasured).
  - Parse CSS padding safely against `""` / `NaN` / negative values: `parsePx(v) = Number.isFinite(Number.parseFloat(v ?? "")) && n > 0 ? n : 0`.
  - Return `null` if active tab already lies within `[safeLeft - 1, safeRight + 1]` (`EPSILON = 1`).
  - When the active tab is wider than the container's safe viewport width, align its start edge (`tabRect.left - safeLeft`) rather than clipping the start of the label.
  - Clamp `nextLeft = Math.min(maxScrollLeft, Math.max(0, container.scrollLeft + delta))`; return `null` if `!Number.isFinite(nextLeft)` or `Math.abs(nextLeft - container.scrollLeft) < 1` (avoids redundant calls at `0` or `maxScrollLeft` when flex trailing padding is omitted from `scrollWidth`).
- Scroll ONLY the horizontal tablist container via `scrollContainer(container, nextLeft, behavior)`:
  - Use `behavior: "instant"` (not `"auto"`) for initial mount, resize, webfont/label realignment, and `prefers-reduced-motion: reduce`, so even if a caller passes CSS `scroll-smooth` in `className`, reduced motion and mount/resize never animate smoothly.
  - Wrap `container.scrollTo({ left: nextLeft, behavior })` in `try { ... } catch { container.scrollLeft = nextLeft; }` and fall back to `container.scrollLeft = nextLeft` whenever `typeof container.scrollTo !== "function"`.
  - Never call `scrollIntoView` (which walks vertical ancestors including `window`).
- `prefersReducedMotion()` guards `typeof window !== "undefined" && typeof window.matchMedia === "function" && Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches)`.
- Motion & trigger contract in `useScrollActiveTab(active, tabsSignature)`:
  - Use `useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect` to prevent a 1-frame flash on deep-linked mobile mounts while staying 100% warning-free during SSR (`renderToStaticMarkup` in vitest `node` env).
  - `tabsSignature` is `JSON.stringify(tabs.map((t) => [t.id, t.label]))` — collision-free, stable across inline `tabs={[...]}` re-renders when IDs and labels are unchanged, and responsive when dynamic tab labels widen (e.g., `/teacher/placement-test` adding ` (2 lỗi)`).
  - Initial mount (`hasMountedRef.current === false`): scroll with `"instant"`. Also schedule a one-time `document.fonts?.ready` realignment (`"instant"`) when `document.fonts?.status !== "loaded"`, cancelled on unmount or if the user manually interacts with the tablist (`pointerdown` / `wheel` / `touchstart`).
  - Subsequent `active` change (`prevActiveRef.current !== active`): scroll with `prefersReducedMotion() ? "instant" : "smooth"`. Track in-flight smooth scroll (`smoothTargetRef` cleared on `scrollend`, user input, or 600ms timeout): if `active` changes mid-flight to a tab currently inside `[safeLeft, safeRight]` (`computeActiveTabScrollLeft === null`) while `smoothTargetRef.current !== null && Math.abs(container.scrollLeft - smoothTargetRef.current) >= 1`, cancel the old smooth animation at `container.scrollLeft` with `"instant"` so the new active tab is not dragged off-screen.
  - Dynamic tab list/label change while `active` is unchanged (`prevTabsSignatureRef.current !== tabsSignature`): scroll with `"instant"`.
  - Unrelated re-renders where both `active` and `tabsSignature` are identical: effect does not re-run (preserves user manual horizontal swipe).
  - `ResizeObserver` on `tablist` (feature-detected via `typeof ResizeObserver !== "undefined"`): coalesce callback with `requestAnimationFrame` (when available, cancelling pending rAF on cleanup) so `AppShell` 200ms sidebar transitions do not force uncoalesced synchronous reflows; track `lastWidth = container.clientWidth`; ignore initial callback and height-only resizes (`nextWidth === lastWidth`); when `nextWidth !== lastWidth` (viewport resize or un-hide `0 -> >0`), update `lastWidth = nextWidth` and scroll with `"instant"`.
  - Compiler & lint hygiene: no browser global reads during render; clean under `packages/ui/tsconfig.json` (`strict: true`, `verbatimModuleSyntax: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `types: []`), defensive indexing without unchecked assumptions, and zero Biome `info` diagnostics (including `useExhaustiveDependencies`).

## Tests Before (Red Phase)

### Task 1.1 — Write failing unit tests for scroll geometry and `useScrollActiveTab`
- **Goal:** Establish comprehensive red-phase TDD coverage before creating the hook module.
- **Target files and symbols:** Create `packages/ui/src/hooks/use-scroll-active-tab.test.tsx` testing exports `computeActiveTabScrollLeft`, `prefersReducedMotion`, and `useScrollActiveTab` from `./use-scroll-active-tab`.
- **Steps:**
  1. Create `packages/ui/src/hooks/use-scroll-active-tab.test.tsx` (jsdom environment is default in `packages/ui/vitest.config.ts:14`, importing `describe`/`expect`/`it`/`vi`/`afterEach` explicitly from `"vitest"` since `packages/ui/tsconfig.json:6` sets `"types": []`).
  2. Add unit tests for `computeActiveTabScrollLeft`:
     - Returns `null` when `activeTab` is not contained in `container`.
     - Returns `null` when `scrollWidth <= clientWidth` (no overflow).
     - Returns `null` when container or active tab width is `0`.
     - Returns `null` when active tab is already fully inside `[safeLeft, safeRight]` (with `p-[3px]` padding insets).
     - Handles empty `""` padding on one side (`paddingLeft: "3px"`, `paddingRight: ""`) without `NaN` corruption.
     - Returns positive `nextLeft` when active tab is clipped or completely off-screen to the right, respecting `paddingRight` and clamping to `maxScrollLeft`.
     - Returns smaller `nextLeft` when active tab is clipped or off-screen to the left, respecting `paddingLeft` and clamping to `0`.
     - Aligns start edge (`safeLeft`) when a single active tab is wider than the container viewport.
     - Returns `null` when `Math.abs(nextLeft - container.scrollLeft) < 1` (trailing-padding clamp guard at `0` and `maxScrollLeft`).
     - Handles `clientLeft` border offset accurately.
  3. Add unit tests for `prefersReducedMotion`:
     - Returns `true` when `window.matchMedia("(prefers-reduced-motion: reduce)")` matches.
     - Returns `false` when it does not match, when `window.matchMedia` returns `undefined`, or when `window.matchMedia` is undefined.
  4. Add hook tests for `useScrollActiveTab` using a lightweight test harness component rendering `<div role="tablist" ref={tablistRef}>` and `<button role="tab" ref={...}>`:
     - Initial mount with off-screen active tab calls `scrollTo({ left, behavior: "instant" })`.
     - Changing `active` after mount calls `scrollTo({ left, behavior: "smooth" })` when reduced motion is false.
     - Changing `active` after mount calls `scrollTo({ left, behavior: "instant" })` when `prefers-reduced-motion: reduce` matches.
     - Falls back to setting `container.scrollLeft = nextLeft` when `container.scrollTo` is undefined OR when `container.scrollTo` throws.
     - Re-rendering with a new inline array of identical `[id, label]` pairs does NOT invoke `scrollTo` again (manual swipe preserved).
     - Changing a tab's `label` (dynamic label growth) with same `active` realigns with `behavior: "instant"`.
     - Mid-flight smooth scroll cancellation: switching `active` while a prior smooth scroll is still in flight to a tab currently inside the viewport cancels the old smooth scroll at `container.scrollLeft` with `"instant"`.
     - `document.fonts.ready` resolution on mount realigns with `"instant"` unless the user already interacted with the tablist.
     - `ResizeObserver` width change (`clientWidth` changes from `600` to `343` or `0` to `343`) invokes `scrollTo({ left, behavior: "instant" })` (coalesced via `requestAnimationFrame`).
     - `ResizeObserver` height-only callback (`clientWidth` unchanged) does NOT invoke `scrollTo`.
     - Works cleanly when `ResizeObserver` is undefined (no throw) and disconnects observer + cancels pending rAF on unmount.
     - React `StrictMode` double-effect mount stays `"instant"` and does not wrongly trigger `"smooth"`.
- **Success criteria:** Test file compiles structurally and fails specifically because `./use-scroll-active-tab` does not exist yet.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/hooks/use-scroll-active-tab.test.tsx` exits non-zero due to missing module `./use-scroll-active-tab` (passing here is a failure).

## Implementation

### Task 1.2 — Implement `use-scroll-active-tab.ts`
- **Goal:** Implement the pure horizontal scroll geometry helper and React hook satisfying every red-phase test and edge case.
- **Target files and symbols:** Create `packages/ui/src/hooks/use-scroll-active-tab.ts` exporting `computeActiveTabScrollLeft`, `prefersReducedMotion`, `createTabsSignature`, and `useScrollActiveTab`.
- **Steps:**
  1. Export `createTabsSignature(tabs: readonly { id: string; label: string }[]): string` returning `JSON.stringify(tabs.map((t) => [t.id, t.label]))`.
  2. Define internal `parsePx(value: string | undefined): number` returning `Number.isFinite(n) && n > 0 ? n : 0` where `n = Number.parseFloat(value ?? "")`.
  3. Export `computeActiveTabScrollLeft(container: HTMLElement, activeTab: HTMLElement): number | null`:
     - If `!container.contains(activeTab)`, return `null`.
     - Compute `maxScrollLeft = container.scrollWidth - container.clientWidth`; if `maxScrollLeft <= 0`, return `null`.
     - Read `containerRect = container.getBoundingClientRect()` and `tabRect = activeTab.getBoundingClientRect()`; if `containerRect.width <= 0 || tabRect.width <= 0`, return `null`.
     - Read horizontal padding via `typeof getComputedStyle === "function" ? getComputedStyle(container) : null` using `parsePx(style?.paddingLeft)` and `parsePx(style?.paddingRight)`.
     - Compute `innerLeft = containerRect.left + container.clientLeft`, `innerRight = innerLeft + container.clientWidth`, `hasRoomForPadding = padLeft + padRight < container.clientWidth`, `safeLeft = hasRoomForPadding ? innerLeft + padLeft : innerLeft`, `safeRight = hasRoomForPadding ? innerRight - padRight : innerRight`.
     - Use `EPSILON = 1`:
       - If `tabRect.left < safeLeft - EPSILON`, `delta = tabRect.left - safeLeft`.
       - Else if `tabRect.right > safeRight + EPSILON`, `delta = Math.min(tabRect.right - safeRight, tabRect.left - safeLeft)`.
       - Else return `null`.
     - Clamp `nextLeft = Math.min(maxScrollLeft, Math.max(0, container.scrollLeft + delta))`.
     - If `!Number.isFinite(nextLeft) || Math.abs(nextLeft - container.scrollLeft) < EPSILON`, return `null`.
     - Return `nextLeft`.
  4. Export `prefersReducedMotion(): boolean`:
     - Return `typeof window !== "undefined" && typeof window.matchMedia === "function" && Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches)`.
  5. Define internal `scrollContainer(container: HTMLElement, left: number, behavior: ScrollBehavior): void`:
     - If `typeof container.scrollTo === "function"`, try `container.scrollTo({ left, behavior })`; catch → `container.scrollLeft = left`.
     - Else `container.scrollLeft = left`.
  6. Define `useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect`.
  7. Export `useScrollActiveTab(active: string, tabsSignature: string)`:
     - Refs: `tablistRef`, `activeTabRef`, `hasMountedRef`, `prevActiveRef`, `prevTabsSignatureRef`, `smoothTargetRef`, `smoothTimerRef`, `userInteractedRef`.
     - Helper `clearSmoothTracking()` clears `smoothTargetRef.current = null` and clears any pending `smoothTimerRef.current`.
     - Helper `alignActiveTab(behavior: ScrollBehavior, cancelSmoothIfVisible: boolean)`:
       - Reads `container = tablistRef.current`, `activeTab = activeTabRef.current`; if `!container || !activeTab`, return.
       - Computes `nextLeft = computeActiveTabScrollLeft(container, activeTab)`.
       - If `nextLeft === null`:
         - If `cancelSmoothIfVisible && smoothTargetRef.current !== null && Math.abs(container.scrollLeft - smoothTargetRef.current) >= 1`, call `scrollContainer(container, container.scrollLeft, "instant")` and `clearSmoothTracking()`.
         - Return.
       - If `behavior === "smooth"`, record `smoothTargetRef.current = nextLeft` and schedule a 600ms fallback timer clearing `smoothTargetRef.current`; else `clearSmoothTracking()`.
       - Call `scrollContainer(container, nextLeft, behavior)`.
     - Effect 1 (`useIsomorphicLayoutEffect`, deps `[active, tabsSignature]`):
       - Track `isInitial`, `activeChanged`, `tabsChanged`; update refs.
       - If `!isInitial && !activeChanged && !tabsChanged`, return.
       - Choose `behavior: ScrollBehavior = !isInitial && activeChanged && !prefersReducedMotion() ? "smooth" : "instant"`.
       - Call `alignActiveTab(behavior, !isInitial)`.
     - Effect 2 (`useEffect`, deps `[]`):
       - Guard `container = tablistRef.current`; if `!container`, return.
       - Attach passive user interaction listeners (`pointerdown`, `wheel`, `touchstart`) marking `userInteractedRef.current = true` and calling `clearSmoothTracking()`, plus `scrollend` calling `clearSmoothTracking()`.
       - If `typeof document !== "undefined" && document.fonts && document.fonts.status !== "loaded"`: await `document.fonts.ready` with `cancelled` flag; if `!cancelled && !userInteractedRef.current`, align with `"instant"`.
       - If `typeof ResizeObserver !== "undefined"`: track `lastWidth = container.clientWidth` and `rafId: number | null = null`. On callback, schedule via `requestAnimationFrame` (or synchronous fallback if `typeof requestAnimationFrame !== "function"`): compare `nextWidth = container.clientWidth`; if `nextWidth === lastWidth`, return; update `lastWidth = nextWidth` and align with `"instant"` (canceling any in-flight smooth scroll).
       - Cleanup: set `cancelled = true`, cancel pending rAF, disconnect `ResizeObserver`, remove event listeners, and `clearSmoothTracking()`.
     - Return `{ tablistRef, activeTabRef }`.
- **Success criteria:** All Phase 1 unit and hook tests pass; no Biome or TypeScript errors.
- **Verify:** `pnpm --filter @teacher-os/ui exec vitest run src/hooks/use-scroll-active-tab.test.tsx` exits 0 with all test cases passing.

## Tests After & Regression Gate

### Task 1.3 — Run `@teacher-os/ui` package regression gate
- **Goal:** Verify `@teacher-os/ui` tests, types, and Biome checks (including `info` level for `useExhaustiveDependencies`) are completely green before moving to Phase 2.
- **Target files and symbols:** `packages/ui/src/hooks/use-scroll-active-tab.ts`, `packages/ui/src/hooks/use-scroll-active-tab.test.tsx`.
- **Steps:**
  1. Run full `@teacher-os/ui` test suite, `@teacher-os/ui` typecheck, and Biome check at `--diagnostic-level=info` on touched files.
- **Success criteria:** All `@teacher-os/ui` tests pass, `check-types` exits 0, and Biome reports 0 errors/warnings/info diagnostics.
- **Verify:** `pnpm --filter @teacher-os/ui test && pnpm --filter @teacher-os/ui check-types && pnpm exec biome check --diagnostic-level=info packages/ui/src/hooks/use-scroll-active-tab.ts packages/ui/src/hooks/use-scroll-active-tab.test.tsx` exits 0 with 0 diagnostics.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
