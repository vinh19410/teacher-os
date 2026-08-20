## Parent

#28

## Scope

Make the first kernel snapshot load fail safe: workspace only mounts after a valid snapshot; network/5xx/invalid response gets blocking error + retry; `401` re-authenticates.

- Phase: `plans/260819-2034-production-readiness/phase-04-fail-safe-on-first-snapshot-load.md`
- Depends on: none

## Acceptance criteria

- [ ] No child route mounts before snapshot mapping succeeds.
- [ ] Failure never looks like a legitimate empty org.
- [ ] Typed HTTP `401` clears state and redirects login; retry covers only retryable errors.
- [ ] Timeout, 401, 5xx, malformed payload and successful retry are tested.
