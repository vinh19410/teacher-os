---
phase: 2
title: "Auth tabs and forms"
status: pending
priority: P1
effort: "0.75-1d"
dependencies: [1]
---

# Phase 2: Auth tabs and forms

## Overview

Replace the old two-component toggle with the design's auth card: accessible segmented tabs with sliding white thumb (mode owned by `login.tsx`, persisted to localStorage), mode-swapping title/sub, restyled Google button, "or use email" divider, and both forms migrated onto a new `AuthField` component with 48px inputs, password visibility toggle, live password hint (sign-up), inline notices, and 48px pill submit with spinner. All TanStack Form + better-auth wiring is preserved; the export's fake 900ms submit maps to real `isSubmitting`/`onSuccess` behavior.

## Requirements

Functional:
- Mode state `"signin" | "signup"` in `login.tsx` (replaces `showSignIn`, `apps/web/src/routes/login.tsx:12`), default `"signup"`; initial value read once from localStorage key `teacher-os-auth-tab` guarded by try/catch (export JS: `auth-redesign.html:707,757-759`); every change written back in try/catch (`auth-redesign.html:738`).
- Title/sub swap per mode, verbatim (`auth-redesign.html:715-726`): signin → "Welcome back" / "Sign in to open your workspace."; signup → "Create your account" / "Set up your teacher workspace in a minute." Switch line mirrors mode: "New to Teacher OS? Create an account" ↔ "Already have an account? Sign in" (link button switches mode).
- Tabs per export markup `auth-redesign.html:588-592`: `role="tablist"` `aria-label="Sign in or create account"`, labels "Sign in" / "Create account"; thumb slides via `translate-x-full` when signup (`auth-redesign.html:229-241`).
- Sign-in form: email + password (48px, `autocomplete="email"` / `current-password`, placeholders `you@school.edu` / `••••••••`); "Forgot password?" link in the password label row toggles an inline info notice: "Password reset isn't enabled in this pilot yet. Contact your admin to recover access." (`auth-redesign.html:608-613,834-836`); success notice "Signed in / Opening your workspace…" shown during `onSuccess` before navigate.
- Sign-up form: name + email + password (`autocomplete="name"` / `email"` / `new-password`); password live hint: 14px dot outline + "At least 8 characters"; at ≥8 chars dot fills green with check and text turns success-strong (`auth-redesign.html:686,849-854`); success notice "Account created / Opening your workspace…".
- Auth wiring UNCHANGED (copy from current code): `useForm` default values and zod `onSubmit` validators with identical messages (`sign-in-form.tsx:48-53`, `sign-up-form.tsx:50-56`); `authClient.signIn.email` / `signUp.email` with the same callbacks (`sign-in-form.tsx:30-46`, `sign-up-form.tsx:31-48`); `navigate({ to: "/dashboard" })` on success; `toast.error` on failure. Deliberate delta: remove `toast.success(...)` — inline notice replaces it (errors keep sonner).
- Submit buttons: spinner + `disabled={!canSubmit || isSubmitting}` via `form.Subscribe` (`sign-in-form.tsx:126-141` pattern kept).
- Google button restyled only (see steps); `authClient.signIn.social` google + `callbackURL: ${window.location.origin}/dashboard` untouched (`google-oauth-button.tsx:37-50`).
- Session gate: `authClient.useSession()` `isPending` → `<Loader/>` moves to `login.tsx` shell level (replaces per-form gates at `sign-in-form.tsx:56-58`).

Non-functional:
- A11y: `role=tab`/`tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`; roving tabIndex (selected tab `0`, other `-1`); ArrowLeft/ArrowRight move selection with wrap-around and focus the new tab (`auth-redesign.html:747-751`); `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none` on every control.
- Field states per export: 48px input, `rounded-[var(--radius-md)]`, 1px `--border`; hover `border-[color-mix(in_oklab,var(--fg),transparent_72%)]` (`auth-redesign.html:330`); focus accent border + `--focus-ring`; invalid danger border + danger ring (`auth-redesign.html:335-336`); error slot `min-h-[19px] mt-[5px] text-[13px] text-[var(--danger-strong)]`, `aria-live="polite"`.
- Hint↔error swap without layout shift: both slots reserve `min-h-[19px]`; when invalid show error, else hint (`auth-redesign.html:374-377`).
- Both forms stay mounted; inactive one hidden via the `hidden` attribute (`auth-redesign.html:468`) so typed values survive tab switches.

## Architecture

```
/login (login.tsx — owns mode + session gate)
├── BrandPanel (Phase 1)
└── auth-wrap
    ├── title/sub (mode-driven) + mobile-brand
    ├── AuthTabs(mode, onChange)            ← components/auth/auth-tabs.tsx
    ├── GoogleOAuthButton (restyled)        ← existing file, new classes
    ├── divider "or use email"
    ├── <form role="tabpanel" hidden={mode!=="signin"}>  ← sign-in-form.tsx (rewritten markup)
    │   ├── NoticeInfo (forgot, toggleable) / NoticeOk (signed in)  ← local components in auth/notices.tsx
    │   ├── AuthField email / AuthField password (+toggle, +label-row forgot link)
    │   └── submit pill + spinner
    ├── <form role="tabpanel" hidden={mode!=="signup"}>  ← sign-up-form.tsx (rewritten markup)
    │   ├── NoticeOk (account created)
    │   ├── AuthField name / email / password (+toggle, +live hint)
    │   └── submit pill + spinner
    └── switch line (mode-driven link)
```

Data flow: `mode` lives in `login.tsx`; passed to `AuthTabs` and derived for title/sub/switch-line. Forms receive `onSwitchMode` (replaces `onSwitchToSignUp`/`onSwitchToSignIn` props) used only by the switch line, which now lives in `login.tsx` — forms no longer need switch props. Field data flow unchanged: TanStack `field.state.value` → controlled input; `field.state.meta.errors.map(e => e?.message).filter(Boolean)` → AuthField `errors` prop (exact mapping from `sign-in-form.tsx:93-97`). Success notices: local `useState<boolean>` set in `onSuccess` right before `navigate`.

## Related Code Files

- Create: `apps/web/src/components/auth/auth-tabs.tsx` — tablist + thumb, fully accessible.
- Create: `apps/web/src/components/auth/auth-field.tsx` — label row (+optional trailing link), 48px input, error slot, optional hint slot, optional password toggle.
- Create: `apps/web/src/components/auth/notices.tsx` — `NoticeInfo` / `NoticeOk` (icons + role="status").
- Modify: `apps/web/src/routes/login.tsx` — mode state + localStorage, title/sub, switch line, session gate, renders tabs + both forms.
- Modify: `apps/web/src/components/sign-in-form.tsx` — new markup on AuthField; auth wiring verbatim.
- Modify: `apps/web/src/components/sign-up-form.tsx` — same.
- Modify: `apps/web/src/components/google-oauth-button.tsx` — restyle to export pill; drop shared `Button` import (replaced by local `<button>`; `packages/ui` untouched).
- Reference only: `apps/web/src/lib/auth-client.ts`, `apps/web/src/components/loader.tsx`.

## Implementation Steps

1. **Build `AuthField` and verify error mapping FIRST** (highest-risk item). Props: `label`, `id`, `type`, `autoComplete`, `placeholder`, `value`, `onChange`, `onBlur`, `errors: string[]`, optional `labelRowExtra?: ReactNode` (forgot link), `hint?: ReactNode` (live hint), `passwordToggle?: boolean`, `name`. Sketch:

```tsx
<div className={cn("mb-[14px]", errors.length > 0 && "field-invalid-wrapper")}>
  <div className="mb-[7px] flex items-baseline justify-between gap-[10px]">
    <label htmlFor={id} className="text-[13px] font-[510] tracking-[0.01em] text-fg-2">{label}</label>
    {labelRowExtra}
  </div>
  <div className="relative">
    <input id={id} name={name} type={shown ? "text" : type} autoComplete={autoComplete} placeholder={placeholder}
      value={value} onBlur={onBlur} onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-12 w-full rounded-[var(--radius-md)] border border-line bg-bg px-[15px] text-sm text-fg",
        "transition-[border-color,box-shadow] duration-[150ms]",
        "hover:border-[color-mix(in_oklab,var(--fg),transparent_72%)]",
        "focus:border-accent-blue focus:shadow-[var(--focus-ring)] focus:outline-none",
        passwordToggle && "pr-[50px]",
        errors.length > 0 && "border-danger focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger),transparent_68%)]",
      )} />
    {passwordToggle && (
      <button type="button" onClick={() => setShown(s => !s)}
        aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-[6px] top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-muted-fg transition-[background,color] duration-[150ms] hover:bg-surface hover:text-fg-2 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
        {/* eye SVG, 17px — from auth-redesign.html:638-640 */}
      </button>
    )}
  </div>
  {/* slot: error when invalid, else hint; both reserve 19px */}
  <div className="mt-[5px] min-h-[19px] text-[13px]" aria-live="polite">
    {errors.length > 0 ? <p className="text-[var(--danger-strong)]">{errors[0]}</p> : hint}
  </div>
</div>
```

   Wire ONE field (sign-in email) into the existing form, submit empty → confirm "Invalid email address" renders inline. Only then migrate the rest.

2. **`AuthTabs`** — controlled `{ mode, onChange }`. Keydown handler sketch (wrap-around, focus follows selection):

```tsx
function onKeyDown(e: React.KeyboardEvent) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const next = e.key === "ArrowRight" ? "signup" : "signin";
  onChange(next);                       // parent state drives aria-selected + tabIndex
  (next === "signin" ? tabSignInRef.current : tabSignUpRef.current)?.focus();
}
```

   Container + thumb classes (from `auth-redesign.html:220-253`):

```tsx
<div role="tablist" aria-label="Sign in or create account" onKeyDown={onKeyDown}
  className="relative mb-7 grid grid-cols-2 rounded-[var(--radius-pill)] bg-surface p-1">
  <span aria-hidden className={cn(
    "absolute left-1 top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-[var(--radius-pill)] bg-bg",
    "shadow-[0_1px_4px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border-soft)]",
    "transition-transform duration-[220ms] ease-[cubic-bezier(0.28,0,0,0.22,1)]",
    mode === "signup" ? "translate-x-full" : "translate-x-0")} />
  {/* two buttons: h-10 rounded-[var(--radius-pill)] text-sm font-[510] text-muted-fg
     aria-selected:text-fg aria-selected:font-[590] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none
     role="tab" aria-selected aria-controls="panel-signin|panel-signup"
     tabIndex={selected ? 0 : -1} */}
</div>
```

3. **`notices.tsx`** — `NoticeInfo` (accent-soft bg, info icon, `role="status"`) and `NoticeOk` (success-soft bg, check icon, `<strong>` success-strong + `<span>` fg-2), classes per `auth-redesign.html:449-465`: `mb-[18px] flex items-start gap-[10px] rounded-[var(--radius-md)] px-[14px] py-3 text-[13px] leading-[1.45]`. Render only when active (conditional render, not CSS display toggle). Copy verbatim from export lines 612, 619, 657.

4. **Rewrite `sign-in-form.tsx` markup** (wiring block copied verbatim from current lines 19-54, minus `toast.success` in `onSuccess` — instead `setSignedIn(true)` then `navigate`). Form: `role="tabpanel" aria-labelledby="tab-signin" id="panel-signin" noValidate hidden={hidden}`; submit `e.preventDefault(); e.stopPropagation(); form.handleSubmit();` (from current lines 72-77). Email field per step 1; password field with `passwordToggle` + `labelRowExtra` forgot-link button (`text-xs font-[510] text-accent-blue hover:text-accent-active hover:underline underline-offset-[3px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`, per `auth-redesign.html:397-408`); forgot notice state `useState` toggled by the link, cleared when success notice shows (`auth-redesign.html:825-827`). Submit pill:

```tsx
<button type="submit" disabled={!canSubmit || isSubmitting}
  className="mt-2 flex h-12 w-full items-center justify-center gap-[9px] rounded-[var(--radius-pill)] bg-accent-blue text-sm font-[590] tracking-[0.02em] text-accent-on transition-[background,transform] duration-[150ms] ease-[cubic-bezier(0.28,0,0,0.22,1)] hover:bg-accent-hover active:bg-accent-active active:scale-[0.97] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40">
  {isSubmitting && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[color-mix(in_oklab,var(--accent-on),transparent_70%)] border-t-accent-on" />}
  {isSubmitting ? "Signing in…" : "Sign in"}
</button>
```

5. **Rewrite `sign-up-form.tsx` markup** — same pattern; three fields; password field gets `passwordToggle` + `hint` node:

```tsx
const met = field.state.value.length >= 8;
// hint:
<span className={cn("flex items-center gap-[6px] transition-colors duration-[150ms]",
  met ? "text-[var(--success-strong)]" : "text-muted-fg")}>
  <span className={cn("grid h-[14px] w-[14px] flex-none place-items-center rounded-full border-[1.5px]",
    met ? "border-success bg-success" : "border-line")}>
    {met && /* white check, 7x4 rotated-border or 8px inline SVG */}
  </span>
  At least 8 characters
</span>
```

   Success notice copy "Account created" / "Opening your workspace…" set in `onSuccess` before navigate.

6. **Restyle `google-oauth-button.tsx`** — replace shared `Button` with local `<button type="button">`; keep `GoogleIcon` (already 18px viewBox, `google-oauth-button.tsx:7-32`), `handleGoogleSignIn`, disabled-while-redirecting, error toast. Classes: `mt-[26px] flex h-12 w-full items-center justify-center gap-[10px] rounded-[var(--radius-pill)] border border-line bg-bg text-sm font-[510] tracking-[0.02em] transition-[border-color,background,transform] duration-[150ms] hover:border-fg hover:bg-surface-warm active:scale-[0.97] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40` (`auth-redesign.html:266-286`). Label stays "Continue with Google" (+"Redirecting…" while redirecting).

7. **Rewrite `login.tsx`** — `const [mode, setMode] = useState<Mode>(() => { try { const s = localStorage.getItem(KEY); return s === "signin" || s === "signup" ? s : "signup"; } catch { return "signup"; } })`; `const changeMode = (m: Mode) => { setMode(m); try { localStorage.setItem(KEY, m); } catch {} }`; session gate `if (isPending) return <Loader />`; title/sub/switch-line/tabs/forms per Architecture; divider: `my-[22px] flex items-center gap-[14px] text-[11px] font-[590] uppercase tracking-[0.09em] text-meta` with `h-px flex-1 bg-line-soft` hairlines (`auth-redesign.html:288-300`).

8. Full manual matrix on dev server (see Success Criteria) + `pnpm check`.

## Todo

- [ ] AuthField built; empty-submit error mapping verified on first migrated field
- [ ] AuthTabs with thumb slide + full keyboard behavior
- [ ] notices.tsx (info + ok)
- [ ] sign-in-form.tsx migrated; forgot notice + success notice + spinner submit
- [ ] sign-up-form.tsx migrated; live hint without layout shift + success notice
- [ ] google-oauth-button.tsx restyled (logic untouched)
- [ ] login.tsx mode state + localStorage + title/sub/switch line + session gate
- [ ] toast.success removed from both forms; toast.error kept
- [ ] `pnpm check` + `pnpm test` green

## Success Criteria

- [ ] Empty submit on each form shows the exact current messages inline: "Invalid email address", "Password must be at least 8 characters", "Name must be at least 2 characters" (sign-up). (Browser: submit empty form; errors in `aria-live` slots.)
- [ ] Real sign-in and sign-up against dev server: spinner shows during submit, inline success notice appears, navigation to `/dashboard` happens; wrong credentials → sonner error toast, no inline success notice.
- [ ] Google button initiates redirect (dev origin blocked is fine — the redirect request firing is the signal); error path still toasts.
- [ ] Keyboard pass: Tab reaches tabs → selected tab only; ArrowLeft/ArrowRight switch + wrap + move focus; Tab drills into active panel controls only; every control shows `--focus-ring` on focus-visible.
- [ ] Password toggles announce via `aria-pressed`/`aria-label` swap; hint turns green at exactly 8 chars, no layout shift when error replaces hint.
- [ ] Reload preserves last tab (localStorage); blocked storage (Safari private) falls back to "signup" without console crash.
- [ ] Tab switch keeps typed values (both forms mounted).
- [ ] `pnpm check` and `pnpm test` green; `git diff` on the two form files shows auth-wiring blocks unchanged (validators, authClient calls, navigate, error toast).

## Risk Assessment

| Risk | L×I | Mitigation | Observable signal |
|------|-----|------------|-------------------|
| TanStack Form error mapping breaks in AuthField (errors shape, onBlur timing, missed `error?.message` optional chaining) | M×H | Copy the exact mapping `field.state.meta.errors.map(e => e?.message).filter(Boolean)` from `sign-in-form.tsx:93-97`; pass as `errors` prop; verify on the FIRST migrated field before bulk migration (step 1 gate). | Empty submit → all expected messages inline; typing then blurring doesn't show stale errors. |
| ARIA tabs implemented wrong (focus lost, tabIndex not roving, panels not linked) | M×H | Follow WAI-ARIA APG tabs pattern + export keydown contract (`auth-redesign.html:747-751`); 2-tab wrap = ArrowRight→signup, ArrowLeft→signin. | Keyboard pass criterion above; axe DevTools scan of /login: zero tablist violations. |
| `.dark`-variant leak or scheme-mapped utility slips into new components | L×M | Auth panel stays light; only explicit token utilities (`bg-bg`, `text-fg`, `bg-surface`, arbitrary `var(--…)`). Re-run the `<html class="dark">` probe from Phase 1. | Colors identical with/without `.dark` on html. |
| localStorage access throws (private mode, storage quota, SSR window guard) | L×M | Both read and write wrapped in try/catch, default "signup" (`auth-redesign.html:738,757-759`). Lazy `useState` initializer runs client-side only for this SPA route. | Safari private-mode reload renders fine, defaults to Create account, no console error. |
| Success-notice/navigate race — notice never visible because navigate unmounts route immediately | M×M | Set notice state synchronously in `onSuccess` before `navigate` (same tick); notice is a transition nicety, navigation is the contract — if it flashes or not, flow still correct. | Fast network: notice visible ≥1 frame; throttled network: clearly visible. |
| Duplicate password inputs confuse browser autofill | L×L | Distinct `autocomplete` values (`current-password` vs `new-password`) and distinct ids (`si-password`/`su-password`) per export. | Chrome/Safari autofill suggests correct field on each tab. |
| Old props (`onSwitchToSignIn`/`onSwitchToSignUp`) left dangling | L×M | Switch line moves to `login.tsx`; forms drop switch props entirely; `pnpm check` (Biome + types) catches dead signatures. | No unused-prop warnings; grep for `onSwitchTo` returns only new mode API. |
