---
title: "Ngân hàng bài tập & Giao bài trên lớp (thiết kế mới)"
description: "Dựng trang Ngân hàng bài tập (/assignments/bank) + tab 'Bài tập' (giao đề cho lớp) trên trang chi tiết lớp theo design mới (assignment-bank.html, class-detail-assign-2.html): 2 bảng mới class_assignment/class_assignment_target, POST /api/classes/:id/assignments, snapshot collection classAssignments, luồng list/assign/success với trạng thái nộp derived."
status: complete
priority: P2
effort: 18h
issue: 208
branch: feat/assignment-bank-and-class-assign
tags: [feature, frontend, backend, database, api]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Ngân hàng bài tập & Giao bài trên lớp (thiết kế mới)

## Overview

Plan #202 (PR #205) đã cho ra mắt trang soạn đề `/assignments/new` với bảng `assignment_prompt` (ngân hàng đề). Thiết kế mới trong cùng project Open Design `f2f4d498-7ea3-403c-89e9-6ac3099ac79b` định nghĩa 2 mảnh còn thiếu của vòng đời đề:

1. **Danh sách ngân hàng bài tập** — `assignment-bank.html` (16:06, mới nhất): trang `/assignments/bank` lọc theo Dạng bài + Dạng đề, hàng đề có tag `Bản nháp` / `Đã dùng N lớp` / `Sẵn sàng`, preview phía học viên sticky bên phải, empty state bộ lọc.
2. **Trang giao bài tập** — `class-detail-assign-2.html` (14:55, **bản chuẩn v2**; v1 `class-detail-assign.html` bị thay thế): tab **Bài tập** trên trang chi tiết lớp với 3 view `list → assign → success`: chọn đề ready từ ngân hàng (draft ẩn), hạn nộp (≥ hôm nay), lời nhắn, chọn học viên trong lớp (mặc định hết), preview, sticky action bar; danh sách bài đã giao là thẻ per-assignment với trạng thái nộp per học viên (`Đã nộp` / `Đã nộp · trễ hạn` / `Chưa nộp · quá hạn` / `Chưa nộp`) và rollup (`Đã nộp hết` / `Quá hạn` / `Đang mở`) — tất cả **derived** từ `submittedAt` + `due` + hôm nay.

Plan này dựng cả 2 mảnh theo đúng vertical-slice kernel của repo (schema → migration → contract → snapshot → POST route → command bus → mapper → UI → tests → E2E), tái dùng nền tảng `assignment_prompt` của #202.

## Design Source

- Chuẩn bank list: `assignment-bank.html` — "Ngân hàng bài tập · Teacher OS" (cập nhật 16:06, `primary: true`, prompt: "Thêm trang hiển thị danh sách bài tập sau khi đã thêm vào ngân hàng bài tập, có filter theo dạng bài").
- Chuẩn giao bài: `class-detail-assign-2.html` — "Bài đã giao · IELTS Writing 7.0 — Nhóm tối" (14:55, `primary: true`, prompt: "Thêm trạng thái đã nộp trên danh sách bài đã giao của lớp"). **v1** (`class-detail-assign.html`, 14:25) là bản dựng đầu — khởi tạo ở view assign, danh sách dạng bảng, tag "Đang mở" hardcode; **mọi quyết định lấy v2**.
- Phân tích chi tiết cả 3 file (copy text chuẩn, trạng thái, JS behavior, đối chiếu schema #202): [research/design-analysis-report.md](./research/design-analysis-report.md).

## Key Decisions

1. **Hai bảng mới `class_assignment` + `class_assignment_target`, không đụng bảng `assignment` hiện có** — bảng `assignment` là grading-only per-student (`studentId` notNull, `packages/db/src/schema/assignment.ts:19-44`); gộp luồng giao bài vào đó sẽ phá surface chấm bài đang có. Một lượt giao = 1 row header (classId, promptId, title snapshot, due ISO, note) + N row target (studentId, `submittedAt` nullable). `submitted/missing` và `trễ hạn/quá hạn` đều **derived** — đúng carve-out "derived-until-user-mutable" của repo.
2. **Due ISO `yyyy-mm-dd`** (precedent `invoice.due`, `packages/api/src/contracts.ts:551-559`) — cần so sánh ngày (min hôm nay, quá hạn, trễ hạn); không dùng dạng display `dd/mm` của `assignment.due`.
3. **Snapshot embed targets vào row** — collection `classAssignments` với `targets: [{studentId, submittedAt}]` gộp từ 2 select trong snapshot projection; web chỉ thêm 1 collection (guard compile-time `SNAPSHOT_COLLECTION_KEYS` buộc web glue land cùng phase 1 như #202).
4. **`POST /api/classes/:id/assignments` viết trực tiếp trong `kernel.ts`** — precedent các mutation class-scoped (`/classes/:id/enroll` kernel.ts:595, `/classes/:id/notes` kernel.ts:882); kế thừa CSRF guard của kernel router. Server tự đọc prompt để snapshot `title` (không tin title từ client) và kiểm tra `studentIds ⊆ enrollment`, prompt thuộc org + status `ready`.
5. **Trang bank ở `/assignments/bank`** (file route `assignments/bank.tsx`, static thắng dynamic `$assignmentId` — precedent `/assignments/new`); vào từ nút ghost "Ngân hàng đề" trên header trang `/assignments`; "Đã dùng N lớp" = đếm distinct `classId` theo `promptId` từ `classAssignments` (dữ liệu thật sau phase 1).
6. **Tab Bài tập + nút hero "Giao bài tập" + 2 stat động mới, giữ 4 stat hiện có** — thiết kế v2 vẽ stat row 4 ô (học viên / bài đang mở / đã nộp trên bài mở / lịch cố định); trang hiện có 4 stat khác (buổi đã học / tiến độ / bài trong syllabus). Chọn giao thoa trung thực: **giữ nguyên 4 stat cũ + thêm 2 stat động của v2** (`bài đang mở` = số item chưa nộp đủ, `đã nộp trên bài mở` = `{done}/{total}`) → 6 StatCard, grid tự xuống hàng; lệch layout 4-ô của design + roster bảng giữ nguyên được ghi lên GitHub issue để chủ sản phẩm xác nhận.
7. **Trạng thái nộp là display-only trong plan này** — thiết kế không có control đánh dấu "đã nộp"; target tạo ra với `submittedAt = null`, mọi tag nộp hiển thị đúng logic derived (unit test bằng fixture có `submittedAt`). Write-path đánh dấu nộp là feature tương lai, ghi Non-Goal.
8. **Search trong trang bank là của design, topnav/global search không đụng** — mock `assignment-bank.html` có ô search lọc trong trạng thái filter của chính trang (state.query, "Xóa bộ lọc" reset luôn query) → hiện thực thành text input **trong filter card** (`Tìm đề theo tiêu đề hoặc nguồn`, match title+source+genre). Ở class-detail, search của mock gắn topnav (toàn cục) — không làm; picker chỉ cần chips (recorded deviation). Global search/topbar là issue riêng (kế thừa Non-Goal #202).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bảng `class_assignment` + `class_assignment_target` + migration D1 + contract zod `.strict()` + `KernelSnapshot.classAssignments` + POST route (201/400/401/404, org-scoped) | P1 |
| 2 | Trang `/assignments/bank` đúng thiết kế: bộ lọc Dạng bài + Dạng đề (phụ thuộc task) + ô tìm trong trang, count + "Xóa bộ lọc", hàng đề với tag trạng thái + "Đã dùng N lớp", preview sticky, empty state | P1 |
| 3 | Tab "Bài tập" trên `/classes/$classId` đúng v2 (trừ layout stat row — Key Decision 6): 3 view list/assign/success, picker chỉ đề ready + tag "Đã giao lớp này" + warn reassign, hạn nộp ≥ hôm nay, chọn học viên (mặc định hết), preview, sticky action bar 4 trạng thái, submit disabled tới khi hợp lệ | P1 |
| 4 | Danh sách bài đã giao: thẻ per-assignment với rollup + per-student submission status (4 loại, derived), summary `{N}/{M} đã nộp`, empty state; 2 stat động mới trên header lớp (bài đang mở, đã nộp trên bài mở) | P1 |
| 5 | Luồng persist thật: giao bài tạo row thật, hiện trong tab + "Đã dùng N lớp" ở bank, sống qua reload; org khác không thấy | P1 |
| 6 | Wiring: route title, `routes-matcher`, CTA "Ngân hàng đề" trên `/assignments`, breadcrumb | P2 |
| 7 | Tests đủ ba lớp (server/unit/component) + E2E Playwright cho cả 2 trang | P1 |

## Non-Goals

- Không làm UI đánh dấu bài đã nộp / nhập điểm trên tab Bài tập (thiết kế không có; display-only — Key Decision 7).
- Không sửa bảng `assignment` (grading), không merge luồng giao bài với luồng chấm bài, không thêm link target→grading row.
- Không redesign chrome trang chi tiết lớp ngoài phạm vi (roster bảng, hero meta giữ nguyên; thêm tab + nút hero + 2 stat động — Key Decision 6).
- Không edit/delete đề trong trang bank (thiết kế không có per-row action).
- Không đụng topbar/global search (ô search của bank nằm trong filter card; search topnav của class-detail mock bỏ — recorded deviation, Key Decision 8).
- Không lưu nháp form khi rời trang; không đính kèm ảnh biểu đồ Task 1.
- Không seed dữ liệu mẫu từ mock vào production (8 đề/2 học viên trong design là placeholder).

## Assumptions

- **v2 (`class-detail-assign-2.html`) là bản chuẩn** cho giao bài (mới nhất 14:55; thay bảng bằng thẻ + submission status). Nếu ý định là v1 (khởi tạo view assign), chỉ đổi default view + cấu trúc list — ghi issue xác nhận như #202 đã làm với v2/v3.
- `used` ở bank = số **lớp** khác nhau đã dùng đề (distinct `classId`), không phải số lượt giao — khóa bằng E2E assert sau reassign (phase 4).
- Words/minutes derived từ task preset (Task 1: 150 từ/20 phút; Task 2: 250/40) — đã encode trong `TASK_PRESETS` (`apps/web/src/components/assignments/assignment-presets.ts:19-94`), không lưu DB.
- Preview-note ở bank giữ **nguyên văn copy tĩnh của design** cho mọi đề ("Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học.") — thông tin `used` đã có ở tag hàng đề.
- Giới hạn: tối đa 1 lượt giao mỗi lần submit; giao lại cùng đề tạo item mới (warn-note thiết kế).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Kernel: schema, contract & POST giao bài](./phase-01-kernel-class-assignment-schema-and-api.md) | Complete |
| 2 | [Trang Ngân hàng bài tập /assignments/bank](./phase-02-web-bank-list-page.md) | Complete |
| 3 | [Tab Bài tập trên trang chi tiết lớp](./phase-03-class-detail-assignments-tab.md) | Complete |
| 4 | [Component tests, E2E & verification sweep](./phase-04-tests-e2e-verification-sweep.md) | Complete |

## Success Criteria

- [x] `/assignments/bank` render đủ thiết kế (bộ lọc 2 tầng + ô tìm trong trang + count + hàng đề + preview + empty state); CTA "Ngân hàng đề" trên `/assignments` dẫn tới; filter Task/Genre/Search hoạt động, "Xóa bộ lọc" reset sạch (kể cả query)
- [x] Tab "Bài tập" trên class detail: list → assign → success; giao bài tạo row thật (target `submittedAt` null); item hiện "Hạn … · 0/N đã nộp" + rollup "Đang mở"; sống qua reload; đề vừa giao tăng "Đã dùng N lớp" ở bank (distinct classId — khóa bằng E2E reassign)
- [x] Header lớp có 2 stat động mới: "bài đang mở" và "đã nộp trên bài mở" `{done}/{total}`
- [x] Validate: thiếu đề/học viên/hạn quá khứ bị chặn client (action bar + field error, không POST) và server (`parseStartDateStrict` + min-today theo ngày VN, enrollment check, draft prompt bị từ chối)
- [x] Picker chỉ hiện đề `ready`; đề đã giao lớp này có tag + warn-note reassign; draft ẩn với help text đúng thiết kế
- [x] `pnpm check`, `pnpm check-types`, `pnpm test`, 2 spec Playwright mới — tất cả xanh

## Verification Commands

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-bank class-assign
pnpm check && pnpm check-types && pnpm test
```

## Dependencies

- Xây trên nền #202 (đã merge PR #205): bảng `assignment_prompt`, `assignmentPrompts` snapshot, `POST /api/assignments/prompts`, trang `/assignments/new`, `TASK_PRESETS`. Không phụ thuộc plan nào đang mở.
- Blocked-by: không. Blocks: write-path đánh dấu "đã nộp" + link sang grading (tương lai, chưa có plan).

## Red Team Review (3 personas, 2026-09-18)

*(Spawn subagent type `code-reviewer` lỗi hạ tầng `[reasoning-level-missing]` — chạy lại bằng `general-purpose`; 3 reviewer độc lập: Security Adversary + Fact Checker, Failure Mode Analyst + Flow Tracer, Assumption Destroyer + Scope Auditor.)*

**Findings:** 16 (14 accepted sau ghép trùng, 2 rejected vì trùng) · Severity: 1 Critical, 6 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `createdAt` của prompt không có trên wire (contract/snapshot/mapper/UI type) — phase 2 sort + meta `Thêm {date}` không dựng được; 3 reviewer cùng phát hiện | Critical | Accept | Phase 1 (+ISO string, theo convention snapshot) |
| 2 | Insert header + N targets không bắt buộc `db.batch` atomic — header mồ côi 0-target, rollup "Đã nộp hết" vacuous | High | Accept | Phase 1 (một `db.batch` duy nhất) + Phase 3 (guard `targets.length === 0`) |
| 3 | Reconcile → success là success giả (không kiểm chứng row tồn tại) — mất lượt giao âm thầm | High | Accept | Phase 3 (verify snapshot sau reconcile/refresh) |
| 4 | `Tag` không có biến thể tone ok/warn/danger — primitive chưa được lên kế hoạch | High | Accept | Phase 3 (StatusTag mới / extend ui/tag.tsx) |
| 5 | Goal 3 "đúng v2" tự mâu thuẫn với việc cắt stat row động | High | Accept | plan.md KD6 + Phase 3 (thêm 2 stat động, giữ 4 stat cũ) |
| 6 | Contract due chỉ regex — chấp nhận `2030-02-30`; precedent `parseStartDateStrict` bị cite sai ("server local" không tồn tại trên Workers) | High | Accept | Phase 1 (route gọi `parseStartDateStrict` + min-today theo ngày VN UTC+7 dùng helper dùng chung) |
| 7 | Search của mock bank là filter trong trang (state.query) — bị misclassify thành global search | Medium | Accept | plan.md KD8 + Phase 2 (text input trong filter card) |
| 8 | Copy preview-note động "Đã dùng ở N lớp…" không có trong design — mâu thuẫn success criterion copy chuẩn | Medium | Accept | Phase 2 + Assumptions (giữ copy tĩnh design) |
| 9 | "Đã dùng N lớp" distinct-classId là giả định — E2E không khóa | Medium | Accept | Phase 4 (assert sau reassign vẫn "Đã dùng 1 lớp") |
| 10 | Snapshot 2 select phi nguyên tử — race tạo header targets rỗng | Medium | Accept | Phase 1 (select header trước, targets sau; drop orphan targets) |
| 11 | Không cap tổng lượt giao/lớp; `studentIds` max 50 vs mặc định chọn hết | Medium | Accept | Phase 1 (cap 200 assignment/lớp, studentIds max 100) + Phase 3 (guard client) |
| 12 | Reset view state mập mờ (useEffect vs key-remount); hero ẩn sai khi rời tab | Medium | Accept | Phase 3 (`key={classId}` remount + wrap setTab + hero hide iff tab active && view ≠ list) |
| 13 | Rollout order web/server qua shape guard + quy tắc sửa migration đã apply | Medium | Accept | Phase 1 (runbook deploy server trước; không sửa migration đã apply → tạo 0019) |
| 14 | ChipFilter/hàng đề thiếu semantics radiogroup/listbox như design | Medium | Accept (modified) | Phase 2/3 (dùng `aria-pressed` trên button — đơn giản, trung thực; không thêm role listbox) |
| 15 | Rate-limit/bodyLimit tổng thể cho route mới | Medium | Reject | Đã có cap per-class (finding 11) + CSRF/org guard; rate limiter toàn app là việc của infra, không scope plan này |
| 16 | `createdAt` epoch ms phá convention ISO string của snapshot | Medium | Accept (ghép finding 1) | Phase 1 (cả 2 collection đều ISO string) |

**Verdict: GO sau khi áp dụng** — 0 blocker còn lại; 2 xác nhận sản phẩm (v2 chuẩn; lệch stat row/search topnav) đẩy lên GitHub issue.

## Validation Log

### Verification Results (Fact-check pass, 2026-09-18)

- Claims checked: 28 (Fact Checker của Security reviewer) + flow-trace toàn chuỗi submit→refetch→render + 12 giả định lens Assumption Destroyer
- Verified: 39 | Failed: 1 (→ Finding 1: `createdAt` prompt không có trên wire — `packages/api/src/contracts.ts:570-580`, `apps/server/src/routes/snapshot.ts:283-295`)
- Tier: Standard (4 phases → Fact Checker + Contract Verifier + Flow Tracer + Scope Auditor qua 3 reviewer)
- Bằng chứng chọn lọc (đọc trực tiếp trong phiên):
  - `apps/server/src/routes/kernel.ts:589,665,740` — precedent `db.batch` cho mọi mutation đa statement (finding 2)
  - `packages/api/src/skeleton.ts:61-70` — `parseStartDateStrict` là UTC roundtrip lịch, KHÔNG so today (finding 6)
  - `apps/web/src/lib/use-kernel-form-submit.ts:57-72` + `apps/web/src/lib/repos/kernel.ts:561-575` — reconcile không kiểm chứng row (finding 3)
  - `apps/web/src/components/ui/tag.tsx:1-7` — Tag không có tone (finding 4); `badge.tsx:11-27` là variant màu nhưng sai visual
  - `class-detail-assign-2.html:261-267,534-544` — stat động v2 (finding 5); `assignment-bank.html:199,312-319,390` — search là state trong trang (finding 7)
  - `apps/e2e/specs/helpers.ts:41-51` — `vietnamTodayISO` precedent cho helper ngày VN dùng chung (finding 6)
  - `apps/web/src/lib/repos/kernel.ts:363-401,430-434` — compile guard + runtime shape guard → runbook deploy (finding 13)
  - 12/12 giả định bị tấn công còn lại đều verified (v2 authoritative, static route thắng dynamic, TASK_PRESETS khớp genre design, enrollment là nguồn roster, E2E seed qua UI khả thi…)

### Whole-Plan Consistency Sweep (2026-09-18)

- Đối chiếu chéo plan.md ↔ 4 phase files sau khi áp 14 findings: `createdAt` ISO string nhất quán (phase 1 thêm cho cả prompt row lẫn class assignment row; phase 2 sort/meta dựa trên đó); copy preview-note tĩnh duy nhất một chỗ; search trong trang chỉ ở phase 2 (bank) + ghi deviation ở phase 3; stat động xuất hiện đồng thời ở plan.md Goals/KD6, phase 3 Requirements, phase 4 assert.
- Không còn tham chiếu mâu thuẫn: đã bỏ "epoch ms" cho createdAt, bỏ "server local" cho due, bỏ nhánh copy động preview-note, bỏ mô tả "Tag + biến thể ok/warn/danger" (thay bằng StatusTag).
- `ak plan validate` → `[OK]` sau sweep.

## Research & Reports

- [research/design-analysis-report.md](./research/design-analysis-report.md) — phân tích 3 mockup (copy chuẩn, trạng thái, JS, đối chiếu schema).
- [reports/scout-report.md](./reports/scout-report.md) — hiện trạng codebase: #202 end-to-end, class detail, patterns, tests.
