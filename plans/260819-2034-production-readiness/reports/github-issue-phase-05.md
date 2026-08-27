## Parent

#28

## Scope

Normalize kernel command outcomes and update every current mutation caller so UI only closes/resets after confirmed commit and never blindly replays an unknown outcome.

- Phase: `plans/260819-2034-production-readiness/phase-05-make-mutation-failure-truthful-in-the-ui.md`
- Depends on: none

## Acceptance criteria

- [ ] Action-to-caller matrix covers every `KernelAction` with no unresolved caller.
- [ ] Result distinguishes committed, refresh status, definite failure and outcome-unknown; `id` is optional metadata.
- [ ] Unknown outcome reconciles snapshot before any manual retry; no duplicate create through blind replay.
- [ ] All direct actions await outcome, block double submit and preserve input on definite failure.
- [ ] Tests cover `{ id }`, `{ ok: true }`, response-loss and refresh-failure paths.
