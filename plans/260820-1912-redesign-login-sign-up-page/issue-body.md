## Plan: Redesign login / sign up page

Rebuild `/login` as the approved two-panel auth screen: dark **brand panel** (logo, headline, static product mock card) + **auth panel** with accessible segmented Sign in / Create account tabs, Google button, and redesigned email forms — matching the static design export `auth-redesign.html` (858 lines; tokens identical to the app's frozen `packages/ui/src/styles/globals.css`).

**Hard invariant:** all auth wiring is preserved unchanged — `authClient.signIn.email` / `signUp.email`, zod validators + messages, full-page `window.location.assign(validateReturnUrl(returnUrl))`, sonner **error** toasts. Deliberate deltas only: success toasts → inline notices; mode toggle → accessible tabs persisted to localStorage.

| | |
|---|---|
| Branch (current) | `develop` |
| Branch (implementation) | `feat/redesign-login-sign-up-page` |
| Mode | fast (auto-detected), HOLD SCOPE |
| Effort | ~1.5–2d |

### Plan files

- Plan: [plans/260820-1912-redesign-login-sign-up-page/plan.md](../tree/develop/plans/260820-1912-redesign-login-sign-up-page/plan.md)
- Phase 1 — Auth shell and brand panel: [phase-01-start.md](../tree/develop/plans/260820-1912-redesign-login-sign-up-page/phase-01-start.md)
- Phase 2 — Auth tabs and forms: [phase-02-auth-tabs-and-forms.md](../tree/develop/plans/260820-1912-redesign-login-sign-up-page/phase-02-auth-tabs-and-forms.md)
- Phase 3 — Polish and verification: [phase-03-polish-and-verification.md](../tree/develop/plans/260820-1912-redesign-login-sign-up-page/phase-03-polish-and-verification.md)

Brainstorm report: None found.
Open questions: None.

### Summary

1. **Phase 1 — Static shell (0.5d):** 2-column grid `minmax(460px,1.12fr) minmax(420px,1fr)` + dark brand panel (`bg-[var(--fg)]`/`text-[var(--bg)]` — never engages the `.dark` variant), static mock card, mobile-brand row; existing forms keep rendering inside the new auth wrap → zero behavior change.
2. **Phase 2 — Tabs + forms (0.75–1d, highest risk):** `auth-tabs.tsx` (ARIA tablist, sliding thumb, roving tabIndex, arrow keys with wrap), `auth-field.tsx` (48px inputs, error slot `min-h-[19px]`, password toggle `aria-pressed`, live ≥8-chars hint without layout shift), inline notices (forgot-password pilot notice + success notices), mode state + localStorage `teacher-os-auth-tab` (default `signup`). **Step 1 gates bulk migration on verifying TanStack Form error mapping on one field first.**
3. **Phase 3 — Motion + verification (0.25–0.5d):** rise-in / crossfade / thumb slide / spinner, all `motion-reduce:`-guarded; responsive matrix 360–1920 (no horizontal scroll), keyboard walk, screenshot diff vs export, `pnpm check` + `pnpm test`.

Design source: Open Design export `auth-redesign.html` (provided locally by the designer; not committed to the repo).

### Acceptance criteria

- [ ] Auth flows unchanged: real sign-in, sign-up and Google redirect work against the dev server; zod messages identical; errors still surface via sonner toast.
- [ ] Design fidelity: side-by-side screenshot vs the export shows no visible deltas at 1280px (typography, spacing, colors, mock card, chips, progress bar).
- [ ] A11y pass: tablist/tab/tabpanel roles correct, arrow-key nav with wrap, roving tabIndex, focus-visible ring on every control, password toggle announces state; hidden panel is not tabbable.
- [ ] Responsive matrix 360/420/768/960/1280/1920: no horizontal scroll; ≤960px collapses per export; ≤420px tighter padding + 24px title.
- [ ] `pnpm check` and `pnpm test` green; no new dependencies; no `packages/ui` changes.
- [ ] Reload preserves last tab (localStorage); blocked storage falls back to `signup` without crashing.

Label: `ready to review`
