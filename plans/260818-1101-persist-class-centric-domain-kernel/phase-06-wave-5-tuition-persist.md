---
phase: 6
title: "Wave 5 Tuition persist"
status: completed
priority: P2
effort: "1d"
dependencies: [5]
---

# Phase 6: Wave 5 Tuition persist

## Overview

Bảng `invoice`. List hydrate từ D1 qua shared kernel snapshot cho cả Tuition,
Dashboard và student-detail tuition tab. Mark-paid persist qua serialized command
bus. `AddInvoiceModal` vẫn close-only/no-op. `pkg.remaining` giữ derive wave 4;
không sửa package hay student tabs trong wave này.
<!-- Updated: Red Team Session 2026-08-19 - lock full invoice read/write path -->

## Context Links

- `apps/web/src/routes/_auth/tuition.tsx`
- Stub: `apps/web/src/components/modals/add-invoice-modal.tsx:20-24`
- Other shared-store consumers: `dashboard.tsx:160-166`, `students/$studentId.tsx:74-76,212-228`
- Reducer: `mark-invoice-paid` `data-store-reducer.ts:163-171`
- Snapshot path: `packages/api/src/contracts.ts:174-181`, `apps/server/src/routes/kernel.ts:141-300`, `apps/web/src/lib/repos/kernel.ts:17-20,135-141`, `data-store-reducer.ts:21-23`
- Write bus: `apps/web/src/lib/repos/kernel.ts:22-34,50-125`, `data-provider.tsx:89-117`
- Tags `"nợ học phí"` static — không đổi (plan convert)

## Requirements

- Functional: `GET /api/invoices` + shared snapshot list invoice; mark-paid persist,
  org-scoped; reload giữ `paid + method` trên mọi consumer shared store.
- Non-functional: tạo HĐ vẫn stub; không có `POST /api/invoices` create.
  Không sửa student tabs khác tuition, tags/static stats, package derive,
  hay hành vi classless-student `0/0` đã có (ngoài issue #15).

## Architecture

```
invoice: id text PK,
         orgId text NOT NULL → organization.id ON DELETE CASCADE,
         studentId text NOT NULL → student.id ON DELETE CASCADE,
         amount integer NOT NULL,
         status text NOT NULL DEFAULT 'unpaid',
         date text NOT NULL,
         type text NOT NULL,
         method text NOT NULL DEFAULT '—',
         createdAt timestamp_ms NOT NULL
indexes: invoice_org_idx(orgId), invoice_student_idx(studentId)
```

1. **Canonical read path:** `loadInvoices(db, orgId)` joins invoice to student on
   both `student.id = invoice.studentId` and `student.orgId = invoice.orgId`,
   orders by `createdAt,id`, and maps an explicit DTO (never raw row/`orgId`).
   Reuse it in `GET /api/invoices` and `loadSnapshot`; no duplicate query shape.
   Add `KernelInvoiceRow` + `KernelSnapshot.invoices`, open `KernelSlice` and
   `kernel-loaded`, and map `studentId → Invoice.sid` in `repos/invoices.ts`.
   All three existing consumers keep reading the same `data.invoices` cache;
   only `tuition.tsx` write behavior is in scope.
2. **Canonical write path:** add `"mark-invoice-paid"` to
   `KERNEL_WRITE_TYPES`; `kernelCommand` maps it to
   `POST /api/invoices/:id/mark-paid` body `{ method }`. The serialized bus POSTs,
   refetches `/api/kernel`, and applies the invoice snapshot. No local-only or
   dual-write path.
3. **Guarded server endpoint:** implement GET + POST inside `kernelRoutes` so
   bootstrap, 401 handling, Origin/CSRF guard and JSON-only guard stay identical
   to Wave 4. `invoiceMarkPaidSchema = z.object({ method:
   z.string().trim().min(1).max(32) }).strict()`; client cannot send `amount` or
   `status`. Both list and mutation bind `ctx.orgId`; unknown/foreign id returns
   404 without resource oracle.
4. **Compatibility lock:** for an existing same-org invoice, mark-paid always
   sets `status='paid'` and overwrites `method`, including an already-paid row.
   This is verified by `data-store-reducer.test.ts:93-100` and the parent plan's
   accepted decision; concurrent calls are last-write-wins by design. Do not
   silently change paid replay to 409.
5. **No create:** test rows arrive through a test-only `insertInvoice` helper.
   `AddInvoiceModal.submit` remains `preventDefault + onClose`; no create route,
   command, fetch or dispatch is added.

## Related Code Files

- Create: `packages/db/src/schema/invoice.ts` + generated migration
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/api/src/contracts.ts` (`invoiceMarkPaidSchema`, `KernelInvoiceRow`, snapshot field)
- Modify: `apps/server/src/routes/kernel.ts` (`loadInvoices`, GET, mark-paid)
- Modify: `apps/server/src/kernel.test.ts` (helper + persist/isolation/guard tests)
- Create: `apps/web/src/lib/repos/invoices.ts` + mapping tests
- Modify: `apps/web/src/lib/repos/kernel.ts`, `kernel.test.ts` (snapshot mapping + write bus)
- Modify: `apps/web/src/lib/data-store-reducer.ts`, `kernel-runtime.contract.test.ts` (hydrate invoices)
- Modify: `apps/web/src/routes/_auth/tuition.tsx` only as needed to await/handle persistent dispatch
- Create/Modify: modal no-create contract test
- Zero-change consumers: `dashboard.tsx`, `students/$studentId.tsx` (shared cache updates them)
- Do not modify behavior: `add-invoice-modal.tsx` (vẫn close no-op), student tabs khác, package derive
- Do not create: `apps/server/src/routes/invoices/` (would lose router-local guards), invoice create endpoint

## Implementation Steps

1. Schema + export + `pnpm run db:generate`; invoice has org/student FKs,
   deterministic timestamps/order and indexes.
2. Contract + read path: `KernelInvoiceRow`, `KernelSnapshot.invoices`,
   org-bound `loadInvoices`, `GET /api/invoices`, kernel snapshot, reducer payload,
   `KernelSlice`, `repos/invoices.ts` mapping.
3. Write path: strict mark-paid body, org-bound endpoint in `kernelRoutes`,
   `KERNEL_WRITE_TYPES` + `kernelCommand` + refetch. Preserve paid-method overwrite.
4. Keep Tuition package section on Wave 4 derive and all three invoice consumers
   on shared D1 cache; no per-route fetch cache.
5. Contract-lock `AddInvoiceModal` close-only and absence of create command/route.
6. Handler tests in `apps/server/src/kernel.test.ts`: unauthenticated 401; new org
   has zero invoices; GET/snapshot org-scoped; mark-paid survives refetch; unknown
   and cross-org POST 404 with owner row unchanged; no/foreign Origin 403;
   non-JSON 415; invalid/extra body 400; paid replay overwrites method; packages
   unchanged. Repo/bus tests cover DTO mapping, `isKernelWrite=true`, path/body,
   and snapshot hydration.

## Todo

- [x] Bảng invoice + migrate + export
- [x] Shared snapshot/GET hydrate invoices cho 3 consumer
- [x] Mark-paid qua command bus + guarded org-scoped endpoint
- [x] AddInvoiceModal no-op + no create route contract
- [x] Isolation/guard/reload tests + quality gate

## Success Criteria

- [x] Reload giữ status paid + method trên Tuition, Dashboard debt và student-detail cache
- [x] Org B không đọc/mark-paid invoice Org A; unknown/foreign cùng 404
- [x] Tạo HĐ vẫn không insert; không có create endpoint/command
- [x] Mark-paid không đụng package/remaining; paid replay overwrite method như contract hiện tại
- [x] Quality gate xanh (`pnpm test && pnpm check-types && pnpm run check`)

## Completion Evidence

- Server handler: 37/37 test pass, gồm auth, isolation, guard, reload và replay.
- Web: 94/94 test pass; mapper, shared hydrate, command bus và no-create contract được khóa.
- Quality: `pnpm check-types`, Vite production build, `pnpm run check` và `git diff --check` exit 0.
- Review: Stage 1 spec compliance PASS; Stage 2 Approve, 0 Critical/Important.
- Residual beta risk: chưa smoke trên Cloudflare D1 thật bằng hard reload qua ba consumer.

## Risk Assessment

Read/write path đa tầng giống Wave 4; thiếu snapshot/payload/whitelist sẽ fail
im hoặc local-only. Signal: Tuition rỗng dù GET có row, Dashboard/student
detail lệch, hoặc paid mất sau reload. Response: contract + handler + bus tests
bắt từng tầng.

Tuition còn đọc `s.pkg.done` trên type mock. Phải giữ số derive, không
counter. Signal: mark-paid vô tình sửa package. Response: endpoint chỉ update
invoice; test packages before/after bằng nhau.

## Security Considerations

Mark-paid chỉ invoice cùng org; handler fail closed 401 khi không có
`kernelCtx`; foreign/unknown id đều 404. Không tin `amount`, `status` hay
`studentId` từ client lúc mark-paid. Endpoint nằm trong `kernelRoutes` để kế
thừa Origin/CSRF + JSON-only guard. Read helper join invoice/student cùng org để
malformed cross-tenant relations không bị expose.

## Red Team Dispositions

### Session — 2026-08-19 (Wave 5 scope re-verification, scoped phase-06)

**Reviewers:** Security Adversary + Assumption Destroyer (Light tier — Fact
Checker). 16 findings thô → 9 unique sau dedup: 8 accepted, 1 rejected as
pre-existing/out-of-scope. Mọi finding adjudicated có evidence `file:line`.

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| 1 | Thiếu full invoice hydrate path; 3 consumer shared-store | Critical | Accept: snapshot + GET reuse `loadInvoices`, map shared cache |
| 2 | `mark-invoice-paid` local-only, không qua command bus | Critical | Accept: whitelist + kernelCommand + refetch |
| 3 | Router invoice riêng không mount/mất Origin guard | Critical | Accept: endpoint trong `kernelRoutes` |
| 4 | Schema/DTO thiếu FK, index, ordering, `studentId→sid` | High | Accept: full schema + explicit DTO/adapter |
| 5 | Auth/org binding và malformed cross-org relation chưa khóa | High | Accept: fail-closed ctx, org predicates, same-org join |
| 6 | Status/method/replay semantics mơ hồ | High | Accept: strict bounded method; giữ paid overwrite |
| 7 | AddInvoiceModal no-op chưa regression-lock | Medium | Accept: modal/no-create contract test |
| 8 | Test plan không chứng minh isolation/guard/migration | Medium | Accept: real-handler matrix |
| 9 | Student không package hiển thị 0/0/NaN | High | Reject: pre-existing Tuition display issue, không thuộc acceptance #15; không silent-scope expand |
