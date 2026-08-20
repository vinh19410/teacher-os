---
phase: 4
title: "Fail-safe first snapshot load"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 4: Fail-safe first snapshot load

## Overview

Keep the authenticated workspace unmounted until a valid first kernel snapshot exists; failed load shows a blocking retry/re-auth state, never `emptyKernelData` as if it were an empty org.

## Requirements

- Handle timeout/network/5xx/invalid JSON as failure; provide retry without full-page reload.
- Use a typed transport error carrying HTTP status; on `401`, clear in-memory state and redirect to login/re-auth instead of offering a retry loop.
- Preserve the PDR load-gate and do not introduce client-side mock fallback.

## Architecture

Replace the boolean `kernelLoaded` state in `apps/web/src/lib/data-provider.tsx` with an explicit loading/ready/error state. `fetchKernelSnapshot` must throw a typed HTTP error so the provider can distinguish `401` from retryable failures without changing the kernel snapshot contract.

## Related Code Files

- Modify: `apps/web/src/lib/data-provider.tsx`.
- Modify: `apps/web/src/lib/repos/kernel.ts`.
- Modify/create: focused Vitest tests under `apps/web/src/lib/`.
- Inspect: `apps/web/src/routes/_auth/route.tsx`, `apps/web/src/lib/auth-client.ts`.

## Implementation Steps

1. Characterize current first-load behavior with unit tests.
2. Model loading, ready and failure states; only `ready` mounts children.
3. Render accessible error/retry UI; for `401`, clear state and redirect to login with a safe return URL rather than relying on the already-passed route guard.
4. Test timeout, `401` redirect, `5xx`, malformed response and a successful retry.

## Success Criteria

- [ ] No route mounts before a valid snapshot maps successfully.
- [ ] Failure cannot display empty students/classes as a legitimate workspace.
- [ ] Retry that succeeds hydrates once and mounts the app.
- [ ] Web tests, types and build pass.

## Risk Assessment

Do not confuse a true new org (valid empty snapshot) with load failure. Signal: first user cannot access a valid empty org. Response: assert both cases separately using transport success versus failure, not array length.
