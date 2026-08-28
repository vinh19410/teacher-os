---
title: "104: Persist student package when created without a class"
description: "P0 bugfix — POST /api/students drops total/price/mode when classId is absent; make session_package able to exist without an enrollment (parked package) so gói buổi/đơn giá survives."
status: completed
priority: P0
effort: "1.5d"
tags: [bugfix, qc, p0, students, session-package]
blockedBy: []
blocks: []
created: 2026-08-28
---

# 104: Persist student package when created without a class

## Overview

QC (issue #104, P0): form **Thêm học viên** nhận Số buổi gói + Đơn giá + Hình thức,
nhưng khi tạo từ list `/students` (payload không có `classId`), `POST /api/students`
chỉ insert `session_package` bên trong nhánh `if (cls)` → `total/price/mode` bị bỏ
im lặng. List render `ZERO_PKG` (`0 buổi · Online`, `0 / 0`, `0đ`) và `/tuition` hiện
badge đỏ **Sắp hết**. Mất dữ liệu người dùng nhập (money-adjacent).

Root cause đã xác minh (kongming + 2 researchers + red-team 3 reviewers, file:line
trong phase files): entitlement bị neo bắt buộc vào `enrollment`, trong khi product
cần entitlement tồn tại **trước** khi có lớp. Fix đúng hướng: cho `session_package`
tồn tại không kèm enrollment ("parked package") — cắt neo ở bảng lá duy nhất an toàn.

## Decisions (chốt cùng kongming — advice GO; red-team đã siết thêm)

- **Option B** (chọn): `session_package` thêm `studentId` NOT NULL FK→student
  (`ON DELETE cascade`, khớp convention mọi FK trong repo); `enrollmentId` thành
  **nullable**. Snapshot đổi sang LEFT JOIN, lấy `studentId` trực tiếp từ cột.
  Contract `KernelPackageRow.enrollmentId/classId` → `string | null`.
- **Option A** (enrollment.classId nullable): TỪ CHỐI — SQLite bắt buộc table-recreate
  trên bảng nóng nhất (enrollment), phá invariant 4 + mọi join/filter classId.
- **Option C** (placeholder class "Chưa gán lớp"): TỪ CHỐI — phantom class lộ vào
  classes list/reports; sentinel semantics hỏng theo thời gian.
- **Migration tách 2 file, viết tay phần nguy hiểm** (D1/alchemy apply KHÔNG
  transactional — statement-level autocommit, Evidence: alchemy `ApplyMigrations.js`
  join migration.sql + ledger insert thành một chuỗi; fail giữa chừng wedge deploy):
  - `0011`: (i) **statement đầu tiên là anti-orphan guard** — INSERT-SELECT các row
    `session_package` mồ côi (LEFT JOIN enrollment IS NULL) vào bảng tạm có cột NOT
    NULL; có orphan ⇒ statement fail ⇒ migration dừng TRƯỚC khi đụng data (an toàn
    retry). Cơ chế này cần thiết vì "INNER JOIN mất 0 dòng" KHÔNG suy ra được từ
    `enrollment_id NOT NULL` (NOT NULL ≠ referential integrity — orphan có thể tồn tại
    qua FK-off/manual D1 console delete); (ii) table-recreate + backfill
    `INSERT ... SELECT sp.*, e.student_id FROM session_package sp INNER JOIN
    enrollment e ON e.id = sp.enrollment_id` (pattern `0006_pink_ender_wiggin.sql`);
    (iii) tạo lại TOÀN BỘ index cũ (`session_package_enrollment_uq` sparse trên NULL,
    `session_package_org_idx`) + index mới `session_package_org_student_idx
    (org_id, student_id)`.
  - `0012`: CHỈ partial unique index `session_package_parked_student_uq (student_id)
    WHERE enrollment_id IS NULL` — statement DUY NHẤT chưa từng chạy trên D1, tách
    riêng để fail của nó không chặn/không đụng recreate data. Nếu 0012 bị D1 từ chối:
    KHÔNG sửa file 0012 (alchemy skip theo tên — sửa nội dung sau khi đã apply là
    bẫy rehearsal-stale); ship 0013 fallback (unique thường `(student_id,
    enrollment_id)`) + staging destroy/recreate theo runbook.
  - `meta/0011_snapshot.json` + `meta/0012_snapshot.json` **bắt buộc commit** (mỗi
    journal entry phải có snapshot — nếu thiếu, lần `drizzle-kit generate` kế tiếp
    diff chống 0010_snapshot stale và sinh table-recreate thứ hai phá data). Quy trình:
    sửa schema.ts → `db:generate` lấy journal + snapshots → thay SQL 0011 bằng bản
    viết tay (guard + backfill JOIN đúng) → chạy lại `db:generate` trên tree sạch
    phải cho diff rỗng (assert ở Phase 3 CI gate).
  - Không dùng nguyên bản SQL do tool sinh: INSERT SELECT của tool thiếu `student_id`
    → `NOT NULL constraint failed` trên dòng data đầu tiên của production.
- **Không backfill số buổi/đơn giá bịa** cho học viên không-lớp ĐÃ tồn tại trước fix
  (đó là phát minh số tiền chưa được người dùng xác nhận). Học viên cũ vẫn 0 buổi
  đến khi có edit path (#111 kề cận). Ghi rõ trong PR description để QC không report
  lại như regression.
- **Deploy/rollback (R4)**: snapshot SQL Phase 2 select thẳng `student_id` ⇒
  **0011/0012 phải apply thành công trên D1 TRƯỚC khi worker mới serve** (alchemy áp
  migration trong cùng deploy, resource db trước server). Migration fail ⇒ chặn deploy,
  không rollback code riêng lẻ. Sau 0011, code-rollback cũ (redeploy commit trước)
  làm POST /students 500 (worker cũ INSERT thiếu student_id vào cột NOT NULL) ⇒
  rollback strategy là forward-fix, không phải code revert; quiesce theo runbook
  trước deploy.
- **Out of scope**: validation `total=0`/`price` âm (#115), trang chi tiết học viên
  (#111), enroll-học-viên-có-sẵn-vào-lớp (#122). Khi enroll flow ra đời sau này phải
  quyết định: parked package được "nhận" (UPDATE enrollmentId) hay đóng
  (`status != 'active'`) — không để 2 active song song (ghi nhận, không làm trong PR này).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Phase 1: Schema + migration 0011/0012 + backfill test](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Server — snapshot LEFT JOIN, contract nullable, POST /students parked package](./phase-02-server-parked-package.md) | Completed |
| 3 | [Phase 3: Web + e2e kịch bản QC + full CI gate](./phase-03-web-e2e-ci-gate.md) | Completed |

## Success Criteria (từ acceptance criteria của issue)

- [ ] Server-level: POST /students không lớp với `10 buổi, 400000, Offline` →
      snapshot có package parked đúng giá trị (mode Offline để phân biệt default;
      test Phase 2). UI-level: e2e đúng kịch bản QC (Online) → list hiện
      `10 buổi · Online`, `400.000đ`, `10 / 10` (test Phase 3)
- [ ] `/tuition` không còn `0/0` + badge **Sắp hết** cho học viên vừa tạo (gói `0/10`)
- [ ] Đường CÓ lớp (class detail → thêm học viên) không đổi hành vi — suite hiện tại
      xanh nguyên vẹn
- [ ] Migration 0011 apply trên data thật: anti-orphan guard chặn data mồ côi trong
      test; COUNT(session_package) trước/sau bằng nhau; `student_id` khớp enrollment
      (test existing-data assert)
- [ ] `drizzle-kit generate` trên tree sạch sau 0011/0012 cho diff rỗng
- [ ] Snapshot/contract nullable compile sạch (`pnpm check-types`), mapStudents
      không đổi ngữ nghĩa hiển thị
- [ ] e2e kịch bản QC (tạo từ list, không lớp) xanh
- [ ] Full CI green: `biome check .`, `pnpm test`, `pnpm check-types`, `pnpm build`

## Test commands

- Server: `pnpm --filter server test` (vitest; kernel tests qua HTTP helper;
  **migration test dùng raw `client.execute` + `applyThrough`/`applyFile` pattern
  của `apps/server/src/comment-bank-existing-data-migration.test.ts:29-47` —
  KHÔNG dùng libsql migrator vì nó apply-all, không dừng tại 0010 để seed**)
- Web: `pnpm --filter web test`
- E2E: `pnpm --filter e2e e2e` (cần `pnpm exec playwright install chromium` trong
  apps/e2e; webServer API :8000 + vite :8001, `reuseExistingServer: false`, auth
  round-trip thật qua `signUpViaUi`)
- CI job `quality`: `pnpm exec biome check .` → `pnpm test` → `pnpm check-types` → `pnpm build`

## Risk Assessment

- **R1 (chết người): backfill migration trên D1 forward-only, apply không
  transactional.** Response: anti-orphan guard là statement đầu (fail an toàn,
  chưa đụng data); 0011/0012 tách để statement rủi ro nhất đứng một mình; test
  existing-data theo raw-execute pattern (seed pre-0011, incl. orphan case); verify
  staging D1 trước beta + **chống bẫy rehearsal-stale: trước mỗi lần verify staging,
  check ledger `d1_migrations` — nếu 0011 đã xuất hiện từ bản SQL cũ phải destroy/
  recreate staging**. **Acceptance bar trước merge (điều kiện, không phải ý định):**
  (i) PR description ghi SHA-256 của CẢ HAI file 0011 + 0012; (ii) baseline
  `SELECT COUNT(*), org_id FROM session_package GROUP BY org_id` chụp trước deploy,
  đối chiếu sau deploy + spot-check 1 package cũ vẫn join được enrollment
  (classId non-null) — số cụ thể nằm trong PR; (iii) đóng beta chỉ sau khi verify
  staging: ledger chứa đúng tag mới đúng 1 lần, `PRAGMA index_list(session_package)`
  đủ 4 index, chạy 1 lần flow QC #104 trên staging (tạo học viên không lớp →
  kernel `enrollmentId: null` → `/tuition` hết Sắp hết); (iv) runbook checklist
  trong PR: quiesce trước deploy, forward-fix (cấm code-revert sau 0011),
  0012-fail → 0013 fallback + destroy/recreate staging, ghi chú "học viên cũ vẫn
  0 buổi — không phải regression".
- **R2: nullability rỉ ra typing.** Response: null-guard tường minh ở
  `students.ts:52` thuộc Phase 2 (commit typecheck xanh từng commit), KHÔNG đổi
  `Map` thành `Map<string | null, number>`.
- **R3: parked package tích lũy / ngữ nghĩa active.** Response: partial unique index
  ở tầng DB (0012); enroll flow tương lai phải absorb/đóng (out of scope).
- **R4: deploy window + rollback code vỡ sau 0011.** Response: migration phải apply
  trước worker mới (alchemy ordering); quiesce theo runbook trước deploy; rollback
  = forward-fix; deploy staging verify trước beta.
- **Giả định có thể vỡ:** D1 chấp nhận partial index. Tín hiệu vỡ: 0012 fail trên
  staging. Response định trước: ship 0013 fallback unique thường `(student_id,
  enrollment_id)`, staging destroy/recreate (không sửa 0012 đã-apply — bẫy
  rehearsal-stale), escalate kongming nếu vẫn fail.

## Red Team Review

### Session — 2026-08-28
**Findings:** 16 raw → 15 sau dedupe (14 accepted, 1 rejected)
**Severity breakdown:** 2 Critical, 6 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Thiếu `meta/0011_snapshot.json` → generate kế tiếp sinh table-recreate phá data | Critical | Accept | Phase 1, 3 |
| 2 | D1 apply không transactional; fail giữa chừng wedge deploy vĩnh viễn | Critical | Accept | plan Decisions/R1, Phase 1 |
| 3 | Rehearsal staging có thể chứng minh bản SQL cũ (alchemy skip theo tên) | High | Accept | plan R1 |
| 4 | Phase 2 sai: GET /students KHÔNG trả packages (chỉ snapshot.students) | High | Accept | Phase 2 |
| 5 | addStudent helper thiếu `mode`; "giữ assert cũ" giữ lại assert mã hóa bug (:780-782) | High | Accept | Phase 2 |
| 6 | "INNER JOIN mất 0 dòng" là non-sequitur (NOT NULL ≠ referential integrity) | High | Accept | plan Decisions, Phase 1 |
| 7 | Migration test không viết được bằng libsql migrator (apply-all); phải raw execute | High | Accept | plan Test commands, Phase 1 |
| 8 | `student_id NOT NULL` vỡ code-rollback + deploy window | High | Accept (một phần: giữ NOT NULL + quiesce + tài liệu hoá, không two-step) | plan R4 |
| 9 | Seed spec 2 packages/1 enrollment vi phạm unique index sẵn có | Medium | Accept | Phase 1 |
| 10 | FK `student_id` thiếu ON DELETE cascade (repo convention) | Medium | Accept | Phase 1 |
| 11 | Null-guard để mở "quyết định khi làm", trùng Phase 2↔3 | Medium | Accept | plan R2, Phase 2 |
| 12 | Corpus comment "invariant 6 / keyed by enrollment" mâu thuẫn schema mới | Medium | Accept | Phase 1, 2 |
| 13 | Table-recreate đánh rơi `session_package_org_idx`; schema.ts phải khớp 1:1 | Medium | Accept | Phase 1 |
| 14 | "Rebuild packages/api dist" dead instruction (không có build/dist) | Medium | Accept | Phase 2 (bỏ) |
| 15 | Thiếu invariant deploy ordering (snapshot SQL cần 0011 trước worker mới) | Medium | Accept (merge vào #8) | plan R4 |
| — | Premise "web optimistic reducer assumes package" sai (reducer là fixture cũ; runtime POST+refetch) | — | Reject — plan không dựa vào premise này, vô hại | — |

### Whole-Plan Consistency Sweep — 2026-08-28

Đã re-read plan.md + 3 phase files sau khi áp findings. Kết quả:
- Decision delta lan tỏa đầy đủ: split 0011/0012 + guard + snapshots (Decisions →
  Phase 1 steps/success criteria → Phase 3 generate-diff assert); raw-execute
  pattern (Test commands → Phase 1); GET /students wording (Phase 2
  Requirements/Architecture); helper mode + assert :780-782 (Phase 2); null-guard
  pinned Phase 2, Phase 3 chỉ còn web unit + e2e; comment sweep tách Phase 1
  (schema) / Phase 2 (contracts + students.ts); index policy + ON DELETE cascade
  (Phase 1); R4 deploy ordering + rollback story (Decisions → Phase 2 note về
  dist/API, không đụng deploy).
- Kiểm tra term stale: "GET /students trả packages" — còn 0 chỗ; "giữ nguyên assert
  cũ" — còn 0 chỗ; "libsql migrator cho migration test" — còn 0 chỗ (kernel suite
  vẫn migrate qua libsql, đúng thực tế, khác với migration test); "rebuild api
  dist" — còn 0 chỗ; tham chiếu `session_package_org_idx` khớp giữa plan.md,
  Phase 1 step 2 và case C của migration test.
- Khác biệt có chủ đích (không phải mâu thuẫn): server test dùng `mode: "Offline"`
  (phát hiện drop-input masked bởi default "Online"); e2e dùng "Online" (tái hiện
  đúng Steps của QC #104). Đã ghi rõ trong Success Criteria.
- Kết luận: 0 unresolved contradictions. Plan sẵn sàng cho implementation.

**Rejected rationale:** kongming's evidence về `data-store-reducer.ts:84-109` là
fixture reducer lịch sử — runtime đi POST + refetch snapshot qua command bus
(`repos/kernel.ts:34-50`); không phase nào của plan cite reducer nên không cần sửa.
