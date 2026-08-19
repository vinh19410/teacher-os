## Code Review Summary

### Scope

- Mode: pending changes, Stage 2 production-readiness review after Stage 1 PASS.
- Files: 20 implementation/contract/test/schema/plan files; 2 red-team reports used as input.
- LOC: +2,260 / -36 excluding the two red-team reports; 1,566 added lines are generated Drizzle snapshot metadata.
- Checklists: base + web-app + API, two-pass critical then informational; anti-slop taxonomy applied because diff >300 lines.
- Focus: invoice schema/migration, org-scoped read/write API, shared snapshot/store consumers, serialized command bus, compatibility/deploy risks.

### Overall Assessment

**Approve.** No Critical or Important production defect found. Tenant predicates, fail-closed auth, Origin/JSON guards, explicit DTO projection, migration/export, snapshot hydration, serialized POST→refetch, and paid-replay overwrite semantics are internally consistent. Both prior suggestions are resolved; no open finding remains.

### Critical Issues

None.

### Important Issues

None.

### Suggestions

None open.

Resolved in accepted delta:

1. Direct unauthenticated mutation coverage now POSTs valid Origin/JSON without a session and asserts 401 at `apps/server/src/kernel.test.ts:344-350`. This reaches the route's explicit missing-`kernelCtx` guard at `apps/server/src/routes/kernel.ts:554-557`.
2. The suite now uses the stable domain label `invoice persistence` at `apps/server/src/kernel.test.ts:323`; the plan/wave reference is removed.

### Assessed Non-Issues

- **Malformed directly persisted status/method/negative amount — non-issue for this scope.** Runtime search finds no invoice create/import path; the only insert is the test helper at `apps/server/src/kernel.test.ts:156-178`, and `POST /api/invoices` is explicitly verified absent at `apps/server/src/kernel.test.ts:449-457`. The only public write parses a strict bounded method and updates only `status`/`method` at `apps/server/src/routes/kernel.ts:554-569`. Therefore negative amounts or invalid pre-existing status/method require direct DB insertion/corruption, not an in-scope external input path. Unknown status also maps fail-closed to `unpaid` at `apps/web/src/lib/repos/invoices.ts:5-15`. If a future create/import surface is added, validate amount/status/method there and consider DB CHECK constraints then.

- **Paid replay — locked behavior, not a race bug.** The update is a single org-scoped statement at `apps/server/src/routes/kernel.ts:560-569`; concurrent calls are last-write-wins, and replay overwrites the method by explicit accepted contract at `phase-06-wave-5-tuition-persist.md:72-76`. No recommendation reverses this decision.

- **Rolling deployment compatibility — acceptable in the supported deploy graph.** The migration is additive. Alchemy declares D1 migrations on the DB resource and binds that resource into the server at `packages/infra/alchemy.run.ts:11-22`; the server is resolved before the web deployment at `packages/infra/alchemy.run.ts:42-51`. This yields DB→server→web ordering for the supported stack deployment. Old web clients ignore the added response field. A manually deployed new web against an old server would fail because `invoices` is now required, but that is outside the repository's declared deployment path and no such deploy workflow is evidenced.

- **`loadSnapshot` coupling — no N+1 or observed availability defect.** Invoice loading is one org-scoped query added to the existing parallel snapshot batch at `apps/server/src/routes/kernel.ts:174-240`, with an org index at `packages/db/src/schema/invoice.ts:29-31`. Fail-fast behavior is appropriate because a partial kernel snapshot would desynchronize all three invoice consumers. This does make legacy `/students`, `/classes`, and `/syllabi` list handlers inherit the invoice-table dependency through their pre-existing full-snapshot implementation, but the generated migration and deploy dependency remove the concrete missing-table failure in the supported rollout.

- **Whole-store unchanged coverage — sufficient.** `kernel-loaded` shallow-merges only its typed kernel payload over the current store at `apps/web/src/lib/data-store-reducer.ts:186-188`; the contract test verifies a local collection survives while students and invoices hydrate at `apps/web/src/lib/kernel-runtime.contract.test.ts:78-139`. Exhaustively repeating the same assertion for assignments/reports/comment bank would not prove a different branch.

- **No browser E2E — not a landing blocker.** No Playwright/Cypress harness exists in the repository. The real handler test proves persistence and snapshot reload at `apps/server/src/kernel.test.ts:373-397`; repo tests prove action→path/body and mapping at `apps/web/src/lib/repos/kernel.test.ts:328-343`; reducer hydration is covered at `apps/web/src/lib/kernel-runtime.contract.test.ts:78-139`. The three consumers remain on the same `data.invoices` collection (`tuition.tsx:140-190`, `dashboard.tsx:160-166`, `students/$studentId.tsx:74-76,212-228`), so absence of a newly introduced browser framework is a coverage trade-off, not evidence of broken behavior.

- **Anti-slop review — no structural finding.** The new mapper is domain-anchored and follows existing repo modules; no dependency, generic manager/helper, parallel reimplementation, lint suppression, catch-and-swallow, or unrelated production rewrite was added. `kernel.ts` is already large, but the endpoint intentionally remains inside its guarded router; this change adds a focused helper and two routes rather than a new unguarded router.

### Edge Cases Found by Scout

- Full read chain verified: `loadInvoices` explicit projection and same-org student join (`apps/server/src/routes/kernel.ts:143-171`) → parallel snapshot (`:174-240`) → `KernelSnapshot.invoices` (`packages/api/src/contracts.ts:180-197`) → adapter (`apps/web/src/lib/repos/kernel.ts:142-149`) → typed reducer merge (`apps/web/src/lib/data-store-reducer.ts:21-25,186-188`) → three unchanged consumers.
- Full write chain verified: `mark-invoice-paid` whitelist/command (`apps/web/src/lib/repos/kernel.ts:23-35,102-106`) → POST transport (`:152-170`) → serialized POST/refetch/apply (`:216-250`) → org-scoped server update (`apps/server/src/routes/kernel.ts:554-574`) → refreshed shared store.
- Cross-org invoice/student mismatch is hidden by the same-org join; foreign/unknown mutation IDs are indistinguishable 404 and owner row stays unchanged (`apps/server/src/kernel.test.ts:460-489`).
- Double-click, multi-tab, and paid replay do not create an invalid transition; they converge through serialized per-tab writes and atomic last-write-wins server updates. Method overwrite is intentional.
- No database calls occur inside invoice loops; no SQL injection, mass assignment, raw row exposure, secret/PII logging, or internal stack response was introduced.

### Plan Follow-ups

- All five Phase 6 todo items at `phase-06-wave-5-tuition-persist.md:116-122` appear implemented and verified.
- Phase front matter remains `status: pending` at `phase-06-wave-5-tuition-persist.md:1-7`. Lead/project manager should update plan state after landing; this reviewer did not mutate plan status.

### Verification Evidence

- Fresh reviewer re-review run: server `kernel.test.ts` — 37/37 passed.
- Fresh reviewer run: web `invoices.test.ts`, `kernel.test.ts`, `kernel-runtime.contract.test.ts` — 30/30 passed.
- Fresh reviewer run: `git diff --check` — clean.
- Original evidence packet + independent tester: pre-delta full suite 131/131; check-types, build, and Biome exit 0. Accepted-delta evidence: server typecheck, Biome, and diff-check exit 0.

### Metrics

- Type coverage: percentage not instrumented; TypeScript check passes.
- Test coverage: percentage not collected; 67 focused tests rerun by reviewer pass (37 server + 30 web).
- Linting issues: 0 reported.

### Conclusion

**Approve.** No open finding.

### Unresolved Questions

None.

Status: DONE
Summary: Stage 2 re-review PASS; both suggestions resolved, no Critical/Important finding.
Concerns/Blockers: None.
