---
title: Sign-in validation semantics (issue #114)
date: 2026-08-31
summary: Sign-in form stopped enforcing sign-up rules — required-first messages, no client min-8 block, trimmed email payload; shipped to develop via beta pipeline
---

# Sign-in validation semantics (issue #114)

## What happened

QC P1 #114: submitting the Sign-in tab empty showed "Invalid email address" + "Password must be at least 8 characters", and short passwords were client-blocked on sign-in. Root cause was real, not guessed: `sign-in-form.tsx` reused sign-up schema semantics in its `onSubmit` validator. Fixed via `/ak:vibe --ship --beta --advice`: worktree → TDD plan (validate + 2-lens red-team, 8/9 findings applied, 1 High) → test-first fix → hostile code review (APPROVE, 0 Critical/Important) → PR to develop.

## Decisions

- Sign-in owns **required** semantics only: email = required-first then format (`z.string().trim().min(1).pipe(z.email())`, zod 4.4.3); password = `min(1)`. Length stays a sign-up policy — the server (better-auth) verifies sign-in credentials, and its built-in rate limit (`/sign-in` window 10s/3) is the real control, not a client rule (red-team verified in `create-context.mjs`).
- **Schema lives in `lib/sign-in-schema.ts`**, not inline: unit-testable without mounting a form; the form's `validators.onSubmit` imports it (first runtime-schema import pattern in this repo's forms).
- **Manual email trim at submit is load-bearing**: TanStack Form (form-core 1.33.5) consumes only standard-schema `issues` and discards parsed output, so the schema's `trim()` feeds validation while `onSubmit` must send `value.email.trim()` — otherwise a padded email passes the client and fails auth with a misleading "wrong password" toast. Password is never trimmed (space is a real character); both locked by unit tests, trim locked end-to-end by the e2e payload assertion.
- **E2e cases are one `test()` each with a fresh page**: after a failed submit, `canSubmit` stays `false` until the next submit event (onSubmit validators only run on submit) — a follow-up submit on the same page is silently dropped. This is defined library behavior, not a regression; mislabeling it was the red-team's 1 High finding.
- E2e assertion discipline: the interceptor catching `POST /api/auth/sign-in/email` (with trimmed email + short password in the payload) proves the fix; toast is asserted for presence only — a 401 without CORS headers falls into the catch branch with the same toast text, so pinning text would green-light the wrong path.
- Sign-up untouched (byte-identical) and now regression-guarded: e2e case (c) proves min-8 still client-blocks on the Create account tab. Sign-up's own empty-field copy has the same wrong semantics — tracked as a follow-up issue, not absorbed here (scope discipline).
- Version bump skipped on purpose: repo convention bumps version only at promote-to-main; no fix PR bumps (kongming counsel, verified against history).

## Evidence

- Plan: `plans/260831-1059-fix-114-signin-validation-semantics/` (completed; red-team session + consistency sweep logged in plan.md)
- Gates: unit 7/7 (`sign-in-schema.test.ts`), e2e 3/3 new + 4/4 auth regression local (`signin-validation.spec.ts`, `login.smoke`, `auth-fail-loudly`), `pnpm test` full green, check-types, biome (baseline), build — exit 0
- Review: independent code-reviewer subagent APPROVE (verified diff scope, zod semantics via probe, false-green analysis: both key tests RED under old code)
