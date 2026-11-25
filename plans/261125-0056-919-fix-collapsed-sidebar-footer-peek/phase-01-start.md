---
phase: 1
title: "Phase 1: Fix AppShell, UserFooter & Unit Tests (TDD)"
status: completed
priority: P1
effort: "1.25h"
dependencies: []
---

# Phase 1: Fix AppShell, UserFooter & Unit Tests (TDD)

<!-- Updated: Red Team Session 2026-11-25 - Tailwind v4 transition-[transform,translate,visibility], student user.menu drawer preservation, focus/inert/Escape/resize isolation, exact classList assertions, TeamSwitcher scroll & AvatarMenuContent w-full -->

## Goal
Fix the CSS Grid truncation overflow in `UserFooter` (`TextBlock`), prevent `user.menu` clicks from closing the mobile drawer, contain and visually/a11y-hide the closed off-canvas `<aside>` drawer below `lg` in `AppShell` (with Tailwind v4 `translate` transition and open-drawer focus/`inert`/`Escape`/resize safety), harden adjacent `VersionBadge`, `TeamSwitcher`, and `AvatarMenuContent`, and lock every contract with exact-token TDD unit tests.

## Files to Create / Modify
- Modify: `packages/ui/src/components/app-shell/user-footer.test.tsx`
- Modify: `apps/web/src/components/layout/app-shell.test.tsx`
- Modify: `packages/ui/src/components/app-shell/user-footer.tsx`
- Modify: `packages/ui/src/components/app-shell/app-shell.tsx`
- Modify: `packages/ui/src/components/app-shell/team-switcher.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Modify: `apps/student/src/components/layout/avatar-menu.tsx`

## Tasks & Steps

### Task 1.1 — Add failing TDD unit tests for `UserFooter` truncation, `user.menu` click/Escape isolation & `AppShell` off-canvas containment (Red Phase)
- **Goal:** Encode all layout, interaction, and a11y class contracts in unit tests using exact token assertions (`classList.contains`) so they fail cleanly before implementation edits.
- **Target files and symbols:**
  - `packages/ui/src/components/app-shell/user-footer.test.tsx` (`describe("UserFooter", ...)`)
  - `apps/web/src/components/layout/app-shell.test.tsx` (`afterEach`, `describe("Shared shell — mobile drawer", ...)`, `describe("Web AppShell v2", ...)`)
- **Steps:**
  1. In `packages/ui/src/components/app-shell/user-footer.test.tsx`:
     - Add a test verifying that when `user` has a long `name`, `email`, and `badge` (and also when `menu` renders `ChevronsUpDown`), the `TextBlock` grid wrapper has `classList.contains("grid-cols-1")` and `classList.contains("min-w-0")`, the name row flex wrapper has `classList.contains("min-w-0")`, and the name text span has `classList.contains("min-w-0")` and `classList.contains("truncate")`.
     - Add a test verifying that when `user.menu` AND `user.onClick` are both passed, clicking the footer button toggles `aria-expanded` / opens `user.menu` WITHOUT invoking `user.onClick` (so `AppShell` cannot close the mobile drawer on student menu open), and pressing `Escape` calls `event.preventDefault()` while closing the menu.
  2. In `apps/web/src/components/layout/app-shell.test.tsx`:
     - Add `window.localStorage.clear();` inside `afterEach` (lines 46–50) so collapsed-state tests never leak across test cases.
     - Upgrade existing drawer assertions in `describe("Shared shell — mobile drawer", ...)` to exact token checks via `drawer.classList.contains(...)` (never `className.toContain(...)`, which false-matches `lg:translate-x-0`, `lg:shadow-none`, `lg:visible`, and `invisible`).
     - Add assertions in `describe("Shared shell — mobile drawer", ...)`:
       - On initial closed state (`mobileOpen === false`): `drawer.classList.contains(...)` is `true` for `"overflow-hidden"`, `"invisible"`, `"lg:visible"`, `"pointer-events-none"`, `"lg:pointer-events-auto"`, `"shadow-none"`, `"-translate-x-full"`, `"motion-reduce:transition-none"`, `"transition-[transform,translate,visibility]"`, and `false` for `"visible"`, `"translate-x-0"`, `"shadow-lg"`; `"Open navigation"` has `aria-expanded="false"`.
       - After clicking `"Open navigation"`: `drawer.classList.contains(...)` is `true` for `"visible"`, `"translate-x-0"`, `"shadow-lg"` and `false` for `"invisible"`, `"pointer-events-none"`, `"shadow-none"`, `"-translate-x-full"`; `"Open navigation"` has `aria-expanded="true"`; focus moves to `<aside>` (`document.activeElement === drawer`); the `<header>`/`<main>` content wrapper has `hasAttribute("inert") === true` (NOTE: `jsdom@26` does not implement `HTMLElement.prototype.inert`, so always assert `hasAttribute("inert")`).
       - Clicking a footer button with `user.menu` while the drawer is open keeps the drawer open (`drawer.classList.contains("visible") === true`), opens the menu, first `Escape` closes only the menu (drawer stays open), and second `Escape` closes the drawer (`drawer.classList.contains("invisible") === true`, `aria-expanded="false"`, content wrapper `hasAttribute("inert") === false`, focus returns to `"Open navigation"`).
  3. In `apps/web/src/components/layout/app-shell.test.tsx`, add a test in `describe("Web AppShell v2", ...)` verifying that when `window.localStorage.setItem("teacher-os.sidebar.collapsed", "true")` is set before render, `data-testid="app-version"` remains attached in the DOM and its parent wrapper has `classList.contains("lg:sr-only")`.
- **Success criteria:** Both test files fail on the newly added assertions (confirming red phase before source edits).
- **Verify:**
  - `pnpm --filter @teacher-os/ui test src/components/app-shell/user-footer.test.tsx` exits non-zero with assertion failure (passing test is a failure).
  - `pnpm --filter web test src/components/layout/app-shell.test.tsx` exits non-zero with assertion failure (passing test is a failure).

### Task 1.2 — Fix `TextBlock` overflow & `hasMenu` click/Escape in `UserFooter`, harden `TeamSwitcher` and `AvatarMenuContent`
- **Goal:** Ensure `UserFooter` name + badge + email strictly truncate inside `TextBlock`, clicking a menu-backed footer button never fires `user.onClick`, popover `Escape` consumes the event before `AppShell` closes the drawer, `TeamSwitcher` menu scrolls safely within `<aside overflow-hidden>`, and `AvatarMenuContent` uses `w-full`.
- **Target files and symbols:**
  - `packages/ui/src/components/app-shell/user-footer.tsx` (`UserFooter` lines 56–70, 87–92; `TextBlock` lines 123–172)
  - `packages/ui/src/components/app-shell/team-switcher.tsx` (`TeamSwitcher` lines 52–66, 69, 116, 125, 143, 147)
  - `apps/student/src/components/layout/avatar-menu.tsx` (`AvatarMenuContent` line 36)
- **Steps:**
  1. In `packages/ui/src/components/app-shell/user-footer.tsx`:
     - In `useEffect` (`open`, lines 56–70): keep `keydown` in bubble phase on `document` (do NOT use capture + `stopPropagation()`, which would steal `Escape` from `CommandDialog` / `Modal`); when `event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"], [data-slot="command-dialog"]')`, call `event.preventDefault(); setOpen(false);`.
     - In button `onClick` (lines 89–92): change to:
       ```tsx
       onClick={() => {
       	if (hasMenu) {
       		setOpen((prev) => !prev);
       		return;
       	}
       	user.onClick?.();
       }}
       ```
     - In `TextBlock` (lines 134, 137, 141):
       - `<span className="grid min-w-0 flex-1 grid-cols-1 leading-tight">`
       - `className={cn("flex min-w-0 items-center font-medium", collapsed && "lg:hidden")}`
       - `<span className="min-w-0 truncate" title={user.name}>`
  2. In `packages/ui/src/components/app-shell/team-switcher.tsx`:
     - In `useEffect` (`open`, lines 52–66): keep `keydown` in bubble phase on `document`; when `event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"], [data-slot="command-dialog"]')`, call `event.preventDefault(); setOpen(false);`.
     - Line 69: `<span className="grid min-w-0 flex-1 grid-cols-1 leading-tight">`.
     - Line 116: add `shrink-0` to `ChevronsUpDown` (`"size-4 shrink-0 text-muted-foreground"`).
     - Line 125: add `max-h-[calc(100svh-5rem)] overflow-y-auto` to the `role="menu"` dropdown container.
     - Line 143: add `shrink-0` to org initials badge.
     - Line 147: add `shrink-0` to `<Check aria-hidden="true" className="size-4 shrink-0" />`.
  3. In `apps/student/src/components/layout/avatar-menu.tsx`:
     - Line 36: change `w-56` to `w-full` (`"w-full rounded-md border bg-popover text-popover-foreground shadow-md"`).
- **Success criteria:** `UserFooter` and `AvatarMenuContent` unit tests pass.
- **Verify:** `pnpm --filter @teacher-os/ui test src/components/app-shell/user-footer.test.tsx && pnpm --filter student test test/avatar-menu.test.tsx` exits 0 and prints all tests passed.

### Task 1.3 — Contain & hide closed `<aside>`, preserve Tailwind v4 slide transition, isolate open drawer focus/`inert`/resize, and hide `VersionBadge` visually in collapsed desktop rail
- **Goal:** Prevent any content, border, shadow, pointer hit-target, or keyboard Tab focus from leaking from `<aside>` when `!mobileOpen` on `< lg` (`< 1024px`), preserve smooth Tailwind v4 slide animation and student `user.menu`, isolate background with `inert` when open, auto-close on resize `>= 1024px`, and keep `VersionBadge` unclipped in desktop 64px rail.
- **Target files and symbols:**
  - `packages/ui/src/components/app-shell/app-shell.tsx` (`AppShell`, lines 61–182)
  - `apps/web/src/components/layout/app-shell.tsx` (`AppShellFrame`, `footerSlot` lines 192–196; import `cn` from `@/lib/cn`)
- **Steps:**
  1. In `packages/ui/src/components/app-shell/app-shell.tsx`:
     - Add `const asideRef = useRef<HTMLElement>(null);`.
     - In the `Escape` `useEffect` (lines 67–74): move listener from `document` to `window` bubble phase (`window.addEventListener("keydown", onKeyDown)`) and ignore if `event.defaultPrevented` (`if (event.key === "Escape" && !event.defaultPrevented) setMobileOpen(false);`), guaranteeing `document`-level popovers (`UserFooter`, `TeamSwitcher`) always consume `Escape` first regardless of mount order.
     - Add a `matchMedia("(min-width: 1024px)")` `useEffect` (guarded by `typeof window !== "undefined" && typeof window.matchMedia === "function"`) so when viewport crosses into desktop `lg` (`mql.matches`), `setMobileOpen(false)` runs cleanly (preventing stale `mobileOpen`/`inert` state across resize).
     - Update the focus `useEffect` (lines 85–90): when `!wasOpenRef.current && mobileOpen`, call `asideRef.current?.focus();`; when `wasOpenRef.current && !mobileOpen`, check `const isDesktop = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;` — if `isDesktop`, skip `menuButtonRef.current?.focus()` (and blur `asideRef` only if `document.activeElement === asideRef.current`); otherwise call `menuButtonRef.current?.focus();`.
     - Update `<aside>` (lines 105–112) to include `ref={asideRef}`, `tabIndex={-1}`, and className:
       ```tsx
       className={cn(
       	"sidebar fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-hidden border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[transform,translate,visibility] duration-200 focus:outline-none motion-reduce:transition-none",
       	"lg:visible lg:pointer-events-auto lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0 lg:border-r-0 lg:shadow-none",
       	SHELL_EASE,
       	mobileOpen
       		? "visible translate-x-0 shadow-lg"
       		: "invisible pointer-events-none -translate-x-full shadow-none",
       )}
       ```
       Do NOT add `aria-hidden` or `inert` attributes to `<aside>`.
     - On `<Sidebar user={...}>` (lines 121–131): only wrap `closeDrawer()` when `!user.menu`:
       ```tsx
       user={
       	user
       		? user.menu
       			? user
       			: {
       					...user,
       					onClick: () => {
       						user.onClick?.();
       						closeDrawer();
       					},
       				}
       		: undefined
       }
       ```
     - On the `<header>`/`<main>` content wrapper `<div className="flex min-w-0 flex-col bg-background lg:m-2 lg:ml-0 lg:rounded-xl lg:border lg:shadow-sm">` (line 147), add `inert={mobileOpen}`.
     - On the `"Open navigation"` `<button>` (lines 149–157), add `aria-expanded={mobileOpen}`.
  2. In `apps/web/src/components/layout/app-shell.tsx`:
     - Import `cn` from `@/lib/cn`.
     - Update `footerSlot` (lines 192–196) to `<div className={cn("px-2 pt-1", collapsed && "lg:sr-only")}><VersionBadge /></div>`.
- **Success criteria:** All unit tests in `@teacher-os/ui`, `web`, and `student` shell test suites pass.
- **Verify:**
  - `pnpm --filter @teacher-os/ui test src/components/app-shell/user-footer.test.tsx && pnpm --filter web test src/components/layout/app-shell.test.tsx && pnpm --filter student test test/student-shell.test.tsx test/avatar-menu.test.tsx` exits 0 with 0 failures.
  - `pnpm --filter @teacher-os/ui check-types && pnpm --filter web check-types && pnpm --filter student check-types` exits 0.

## Todo
- [x] Task 1.1: Add failing exact-token TDD unit tests in `user-footer.test.tsx` and `app-shell.test.tsx` (with `localStorage.clear()` teardown)
- [x] Task 1.2: Fix `TextBlock`, `hasMenu` click & capture `Escape` in `user-footer.tsx`, harden `team-switcher.tsx` & `avatar-menu.tsx`
- [x] Task 1.3: Update `<aside>` (`transition-[transform,translate,visibility]`, `overflow-hidden`, `invisible lg:visible`, focus/`inert`/resize, `aria-expanded`) in `packages/ui/.../app-shell.tsx` and `VersionBadge` wrapper in `apps/web/.../app-shell.tsx`

## Verification
- `pnpm --filter @teacher-os/ui test src/components/app-shell/user-footer.test.tsx` exits 0.
- `pnpm --filter web test src/components/layout/app-shell.test.tsx` exits 0.
- `pnpm --filter student test test/student-shell.test.tsx test/avatar-menu.test.tsx` exits 0.
- `pnpm --filter @teacher-os/ui check-types && pnpm --filter web check-types && pnpm --filter student check-types` exits 0.

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
