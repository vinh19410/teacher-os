---
title: "fix-106-kpi-counter-list-pages"
description: "Chuyển KPI / counter trên header các list pages (/classes, /students, /assignments) từ hardcoded string sang derive động từ dữ liệu kernel thật — issue #106 QC P1"
status: completed
priority: P1
effort: "1h"
tags: [bugfix, kpi, counters, list-pages, qc]
created: 2026-09-17
issue: 106
branch: fix/106-kpi-counter-list-pages
route: bugfix
mode: beta
---

# fix-106-kpi-counter-list-pages

## Overview

QC phát hiện trên account thật gần rỗng (`usertest1@mail.com`), header KPI / counter trên các trang danh sách đang bị hardcode số liệu từ open-design HTML prototype:

1. `/classes`: Header hardcode `"3 lớp đang hoạt động"`, trong khi bảng trống (hoặc khi tạo 2 lớp test thì bảng có 2 lớp nhưng header vẫn là 3).
2. `/students`: Header hardcode `"5 học viên đang học · 2 cần chú ý (nợ học phí / sắp hết gói)"`, trong khi bảng trống (hoặc khi tạo 2 học viên test thì bảng có 2 nhưng header vẫn là 5).
3. `/assignments`: Header hardcode `"6 bài tập · 3 cần xử lý"`, trong khi bảng bài tập trống.
4. `/reports`: Từng hardcode `"4 báo cáo tuần này"`, đã được chuyển sang derive động từ `data.reports` trong PR #107. Trang `/syllabus` đã hiển thị đúng `0 template · 0 buổi`.

Expected: Counter phản ánh đúng số liệu thật từ kernel store; khi bảng trống thì hiển thị 0 (empty state), không bịa số.

## Root Cause (đã xác minh bằng code)

- `apps/web/src/routes/_auth/classes/index.tsx:39`: `<PageHead title="Lớp học" lead="3 lớp đang hoạt động" />` chứa chuỗi hardcode `"3 lớp đang hoạt động"`.
- `apps/web/src/routes/_auth/students/index.tsx:41`: `<PageHead title="Học viên" lead="5 học viên đang học · 2 cần chú ý (nợ học phí / sắp hết gói)" />` chứa chuỗi hardcode.
- `apps/web/src/routes/_auth/assignments/index.tsx:41`: `<PageHead title="Bài tập" lead="6 bài tập · 3 cần xử lý" />` chứa chuỗi hardcode.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/classes`: Derive `activeCount` từ `classes.filter((c) => c.status === "active").length`. Header lead hiển thị `${activeCount} lớp đang hoạt động` (0 khi trống). | P1 |
| 2 | `/students`: Derive số học viên từ `students.length` và `attentionCount` từ các học viên có nợ học phí (`data.invoices` chưa thanh toán), gói sắp hết (`s.pkg.total > 0 && s.pkg.remaining <= 4`), hoặc có tag cảnh báo. Header lead hiển thị `${students.length} học viên đang học · ${attentionCount} cần chú ý (nợ học phí / sắp hết gói)` (0 khi trống). | P1 |
| 3 | `/assignments`: Derive tổng số bài tập từ `data.assignments.length` và số bài cần xử lý từ `data.assignments.filter((a) => a.status !== "graded").length`. Header lead hiển thị `${data.assignments.length} bài tập · ${pendingCount} cần xử lý` (0 khi trống). | P1 |
| 4 | Bổ sung ban-list contract test trong `kernel-runtime.contract.test.ts` khóa cứng không cho các chuỗi hardcode cũ quay lại. | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Dynamic KPI counters for list pages](./phase-01-kpi-counter-dynamic-derive.md) | Completed |

## Success Criteria

- [x] Khi account có 0 lớp học: `/classes` hiển thị `0 lớp đang hoạt động`.
- [x] Khi account có N lớp đang học (`status === "active"`): `/classes` hiển thị đúng `N lớp đang hoạt động`.
- [x] Khi account có 0 học viên: `/students` hiển thị `0 học viên đang học · 0 cần chú ý (nợ học phí / sắp hết gói)`.
- [x] Khi account có học viên và hóa đơn: `/students` hiển thị đúng số lượng học viên và số lượng học viên cần chú ý.
- [x] Khi account có 0 bài tập: `/assignments` hiển thị `0 bài tập · 0 cần xử lý`.
- [x] Khi account có bài tập: `/assignments` hiển thị đúng tổng số bài và số bài chưa chấm (`status !== "graded"`).
- [x] `kernel-runtime.contract.test.ts` có negative assertion (ban-list) cấm `3 lớp đang hoạt động`, `5 học viên đang học`, `6 bài tập · 3 cần xử lý`.
- [x] Toàn bộ test suite `pnpm test` chạy xanh 100%.

## Scope Boundary / Non-goals

- Không thay đổi schema database hoặc API server: dữ liệu đã có sẵn trong kernel snapshot (`classes`, `students`, `invoices`, `assignments`).
- Không can thiệp route `/reports` (đã được fix trong PR #107) hoặc `/syllabus` (đã đúng từ trước).
- Không thay đổi hành vi bộ lọc ChipFilter hoặc các modal tạo mới.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/classes/index.tsx`
- Modify: `apps/web/src/routes/_auth/students/index.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/index.tsx`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts`

## Risks & Mitigations

- **Risk:** `StudentsRoute` hiện chỉ gọi `useStudents()`, chưa có `useData()`.
  - **Mitigation:** Import `useData` từ `@/lib/data-store` vào `StudentsRoute` để lấy `data.invoices`, đảm bảo tính toán "nợ học phí" chính xác theo dữ liệu kernel.
- **Risk:** Học viên không có gói (`total === 0`) có thể bị tính nhầm vào "sắp hết gói" nếu chỉ so sánh `remaining <= 4`.
  - **Mitigation:** Thêm điều kiện `s.pkg.total > 0 && s.pkg.remaining <= 4` để đảm bảo học viên chưa có gói không bị đếm sai vào "sắp hết gói".

## Red Team Review

### Session — 2026-09-17
**Findings:** 2 (2 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 0 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Học viên chưa có gói (`total === 0`) có thể bị đếm sai vào "sắp hết gói" nếu chỉ kiểm tra `remaining <= 4` (`students.ts:13-21`, `ZERO_PKG`). | Medium | Accept | Phase 1 (Bổ sung điều kiện guard `s.pkg.total > 0 && s.pkg.remaining <= 4`) |
| 2 | `StudentsRoute` chỉ dùng `useStudents()`, thiếu dữ liệu `invoices` để kiểm tra nợ học phí (`use-students.ts:16-25`). | Medium | Accept | Phase 1 (Import `useData` vào `StudentsRoute` để truy cập `data.invoices`) |

### Whole-Plan Consistency Sweep
- Không có mâu thuẫn giữa `plan.md` và `phase-01-kpi-counter-dynamic-derive.md`.
- Mọi file citation và line references đều khớp với codebase thực tế.
- Không có xung đột file ownership hoặc public API contract drift.
