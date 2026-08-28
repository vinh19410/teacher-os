---
phase: 2
title: "Auth forms fail loudly"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Auth forms fail loudly

## Overview

Close the "silent" half of the P0: `sign-up-form.tsx` and `sign-in-form.tsx`
await the better-auth client with only `onSuccess`/`onError` callbacks and a
`finally`. A rejected fetch (broken SW, offline, CORS, unparsable 5xx) fires
neither callback, so the spinner stops, the form appears to reset, and the
user gets **no feedback** — exactly QC's report. Forms must treat the auth
call and the session verification as two separately-handled layers with
accurate copy, and only show success UI / redirect after the session is
confirmed.

## Requirements

- Functional: any thrown error from the auth client during sign-up/sign-in
  shows a visible error toast; the button stops spinning; no redirect; no
  success banner.
- Functional: a 2xx auth response without a verifiable session (cookie lost,
  blocked, or verification request fails) shows a **distinct** error toast
  that does not claim the account/sign-in failed; no success banner; stays on
  /login.
- Non-functional: single toast per failed submit (existing dedupe convention);
  success notices (`setAccountCreated` / `setSignedIn`) only render after the
  session check passes.

## Architecture

Move both forms from callback style to return-value style so the two failure
layers are structurally separate (red-team: `onSuccess` callbacks run *inside*
the awaited auth call, so a verification throw would land in the auth catch
with the wrong copy, and `setAccountCreated(true)` would render the success
banner before verification):

```tsx
onSubmit: async ({ value }) => {
  onSubmittingChange?.(true);
  try {
    // Layer 1: the auth call. Network throw OR { error } → auth failed.
    const { data, error } = await authClient.signUp.email({ … });
    if (error) {
      toast.error(error.message || error.statusText || "…failed copy");
      return;
    }
    // Layer 2: session verification — its own try/catch, its own copy.
    let session = null;
    try {
      session = (await authClient.getSession()).data;
    } catch {
      session = null;
    }
    if (!session?.user) {
      toast.error(
        "Your account is ready, but we couldn't start your session. Please sign in.",
      );
      return;
    }
    setAccountCreated(true);
    // Full page load: the workspace boots through the kernel load gate.
    window.location.assign(validateReturnUrl(returnUrl));
  } catch {
    toast.error("Couldn't create your account. Check your connection and try again.");
  } finally {
    onSubmittingChange?.(false);
  }
};
```

Sign-in mirrors this with sign-in wording ("Couldn't sign you in…" / "We
couldn't start your session. Please try again."). Session verification encodes
QC's acceptance ("session cookie set → vào dashboard") and converts any future
cookie-layer regression into a visible, correctly-worded error.

Guarded error reads (advisory condition): never read `error.message`/
`error.error.message` unguarded — use `error?.message ?? error?.statusText ??
"<fallback copy>"` so a differently-shaped error object cannot throw inside
the toast path and re-create silence. Cover this with one unit test (vitest)
passing a malformed error object and asserting the fallback copy.

## Related Code Files

- Modify: `apps/web/src/components/sign-up-form.tsx` — restructured submit
  handler per Architecture.
- Modify: `apps/web/src/components/sign-in-form.tsx` — same treatment.
- Create: `apps/e2e/specs/auth-fail-loudly.spec.ts` — regression specs below.

## Implementation Steps

1. Write failing e2e specs first (`auth-fail-loudly.spec.ts`). Cross-origin
   detail: the app fetches `http://localhost:8000` from `http://localhost:8001`,
   so every `route.fulfill` **must** include CORS headers or the browser
   rejects the fabricated response and the spec exercises only the network
   catch:
   - `access-control-allow-origin: http://localhost:8001`
   - `access-control-allow-credentials: true`
   Scenarios (each asserts a sonner toast is visible and URL stays `/login`):
   - **Network error is loud:** `page.route('**/api/auth/sign-up/email', route
     => route.abort())` → fill + submit → toast with the "Couldn't create" copy.
   - **Sign-in network error is loud:** same for `**/api/auth/sign-in/email` →
     "Couldn't sign you in" copy.
   - **Session-less success is loud:** fulfill sign-up 200 (better-auth user
     shape) AND fulfill `**/api/auth/get-session` with `{ null }`-session body
     → the **session-specific** copy appears (distinct from the auth-failure
     copy), no redirect, no "Account created" success banner.
2. Patch `sign-up-form.tsx` per Architecture (return-value style, layered
   error handling, success state only after verification).
3. Mirror in `sign-in-form.tsx` with sign-in wording.
4. Run e2e specs + `pnpm test`/`check-types`/`biome`.

## Todo

- [x] e2e specs written and failing before the fix, green after
- [x] sign-up-form layered error handling + session verify
- [x] sign-in-form layered error handling + session verify
- [x] gates green (biome, test, check-types, build, e2e)

## Success Criteria

- [x] All three new e2e scenarios pass, each asserting its own distinct copy.
- [x] Existing `login.smoke.spec.ts` still passes (happy path unchanged).
- [x] No duplicate toasts; no success banner in any failure scenario.
