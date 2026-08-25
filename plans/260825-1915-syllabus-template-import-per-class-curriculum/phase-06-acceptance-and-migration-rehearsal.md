---
title: "Phase 6: Acceptance and migration rehearsal"
status: todo
priority: P1
effort: "0.5d"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Acceptance and migration rehearsal

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D6 non-goals, assumptions 1-4), [reports/scout-report.md](./reports/scout-report.md) (§6 toàn bộ test inventory, §7 scheduled-lesson tách biệt), [reports/research-report.md](./reports/research-report.md) (§4 chunking guidance).

## Overview

Cổng acceptance cuối: (a) rehearsal migration 0009 trên **bản sao** local dev DB có dữ liệu pilot rồi chạy verification queries của Phase 2; (b) full test suites + typecheck + build toàn workspace; (c) browser smoke end-to-end theo Success Criteria của plan; (d) xác nhận clean cutover + ranh giới scheduled-lesson không bị đụng. Phase này **không sửa source** trừ khi smoke phát hiện defect (fix rồi re-run đúng bước fail).

## Requirements

- [ ] Rehearsal migration: **test tự động in-memory theo pattern `apps/server/src/comment-bank-existing-data-migration.test.ts:29-70`** (red-team A — KHÔNG dùng `db:migrate:deploy`: driver d1-http không credentials, chạy được thì bắn thẳng D1 remote): seed pilot-like → applyFile 0000→0009 → chạy 11 scenario verification của [Phase 2](./phase-02-db-schema-and-migration.md) → kết quả (count class/copy/status) ghi vào note cook.
- [ ] `pnpm --filter server test` pass (suite phase 3 + migration rehearsal test phase 2).
- [ ] `pnpm test` pass toàn workspace (web phase 4-5 + các suite hiện hữu không regression).
- [ ] `pnpm check-types` pass; `pnpm build` pass.
- [ ] `pnpm --filter @teacher-os/db db:generate` không sinh migration mới (parity).
- [ ] Browser smoke (`pnpm dev:server` + `pnpm dev:web`) theo matrix dưới. **Chỉ chạy dev server sau khi 0009 hoàn chỉnh đã land** (red-team A: alchemy dev auto-apply migration — structural-only đã bị ledger khóa).
- [ ] Clean cutover: grep **`apps/` + `packages/`** (code + test) `assign-syllabus|assignSyllabus` → 0 kết quả (red-team K: `open-design/` prototype và `plans/` archive chứa string này — loại trừ, không sửa archive).
- [ ] **Đo payload snapshot (red-team J):** capture `GET /api/kernel` response size trước (branch gốc) và sau (branch feature) với dữ liệu pilot; ghi số vào note PR. Ngưỡng chấp nhận pilot: < 512KB. Vượt → tạo follow-up plan fetch cây theo classId, không sửa lén.
- [ ] Verify pre-prod: runbook — xác nhận chưa có prod D1 nào cần dual-write; nếu có → DỪNG, báo lại quyết định deploy (assumption 1).
- [ ] Deploy coupling note cho PR: release unit = migration 0009 + worker + web trong MỘT deploy (breaking contract, không để hở giữa web cũ/API mới).

## Architecture

Không thay đổi kiến trúc — phase xác minh. Thứ tự: rehearsal DB (tĩnh) → suites (logic) → smoke (hành vi) → grep (cutover). Môi trường smoke: local libsql + dev server, org pilot thật (giữ nguyên dữ liệu, assumption 2).

## Related Code Files

Verify-only — không file nào bị sửa trong phase này:

- `packages/db/src/migrations/0009_syllabus_template_discriminator.sql` — đối tượng rehearsal.
- `apps/e2e/specs/class-operations.spec.ts` — KHÔNG đổi (scout §6: chỉ scheduled lessons/check-in; syllabus không có e2e coverage, không thêm ở plan này).
- `packages/db/src/schema/lesson.ts`, `apps/web/src/lib/repos/lessons.ts` — scheduled-lesson domain: xác nhận không đụng (scout §7, D6).
- Toàn bộ file inventory phase 1-5 — đối tượng của suites + smoke.

## Implementation Steps

1. Chạy rehearsal test in-memory (phase 2) — capture outputs.
2. Chạy `pnpm --filter server test` → xanh.
3. Chạy `pnpm test` → xanh (bao gồm `test:ci-workflow`, `test:topology-drift`).
4. Chạy `pnpm check-types`, `pnpm build`, `pnpm --filter @teacher-os/db db:generate` (parity).
5. Khởi dev servers; đi theo smoke matrix; chụp lại mỗi bước (console không có error/warning lạ); đo payload snapshot trước/sau.
6. Grep cutover (apps/ packages/) + kiểm tra pre-prod; soạn note deploy coupling vào mô tả PR.

## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| *(không file source bị sửa)* | — | — | — |
| `plans/.../reports/*` | read-only reference | — | — |

## Test Scenario Matrix (browser smoke)

| # | Scenario | Priority | Pass khi |
|---|----------|----------|----------|
| 1 | `/syllabus` gallery: chỉ template, badge "đang dùng N lớp", filter chip vẫn hoạt động | Critical | UI đúng count; console sạch |
| 2 | Tạo template mới (AddSyllabusModal) → xuất hiện gallery | High | row mới, `classId null` |
| 3 | Class trống → "Nhập từ template" → chọn template → confirm | Critical | tab Giáo trình có cây, SyllabusProgress toàn upcoming |
| 4 | Import lần 2 (force qua devtools/replay request) → 409 message hiển thị | High | message "Lớp đã có giáo trình", cây nguyên |
| 5 | Edit lesson trên copy lớp → reload → template gallery/detail không đổi | Critical | isolation qua 2 read |
| 6 | Edit lesson trên template → copy lớp đã import không đổi | Critical | isolation chiều ngược |
| 7 | "Gỡ giáo trình" → confirm → cây mất, empty state; DB: copy bị xóa, template còn | Critical | đếm row qua sqlite nếu cần |
| 8 | Tạo lớp kèm template (AddClassModal) → lớp mới có cây sẵn | High | progress hiển thị |
| 9 | Migration rehearsal: Phase 2 matrix 1-11 pass trên seed pilot-like in-memory | Critical | test outputs khớp |

## Success Criteria

- [ ] 9/9 smoke scenario pass (hoặc defect được fix + re-run step fail).
- [ ] `pnpm --filter server test`, `pnpm test`, `pnpm check-types`, `pnpm build`, `db:generate` parity — tất cả pass.
- [ ] Grep `assign-syllabus` trong `apps/` + `packages/` = 0.
- [ ] Note PR chứa: kết quả rehearsal (counts), payload snapshot trước/sau, deploy coupling (một deploy: 0009 + worker + web), xác nhận pre-prod.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Smoke phát hiện defect ở layer dưới sau khi phase dưới "xong" | Fix tại layer đúng (phase sở hữu file), re-run scenario fail + suite liên quan; không hack UI |
| Migration fail trên dữ liệu thật khi deploy | Backfill idempotent (phase 2) cho phép retry; rehearsal test đã cover pilot-like edge (mồ côi, lệch org, share template) |
| Deploy tách migration và worker | Note deploy coupling bắt buộc trong PR; không ship migration riêng lẻ |
| Quên verify pre-prod → breaking đổi trên prod | Requirement chặn: kiểm tra runbook trước merge; có prod → escalate, không cook tiếp |

## Dependency Map

- **Input:** Phase 1-5 hoàn tất (mọi layer đã land trên branch `feat/syllabus-template-import`).
- **Output:** PR merge-able — evidence: rehearsal log, suite outputs, smoke matrix, cutover grep.
