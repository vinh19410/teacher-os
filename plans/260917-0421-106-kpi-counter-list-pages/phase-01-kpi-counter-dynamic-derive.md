---
phase: 1
title: "Dynamic KPI counters for list pages"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Dynamic KPI counters for list pages

## Goal

Chuyển các chuỗi header hardcode trên `/classes`, `/students`, và `/assignments` sang derive động từ dữ liệu kernel, và bổ sung ban-list contract tests để ngăn ngừa hồi quy.

## Files to Modify

- Modify: `apps/web/src/routes/_auth/classes/index.tsx`
- Modify: `apps/web/src/routes/_auth/students/index.tsx`
- Modify: `apps/web/src/routes/_auth/assignments/index.tsx`
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts`

## Tasks & Steps

1. **Classes list page (`apps/web/src/routes/_auth/classes/index.tsx`):**
   - Đếm số lớp đang hoạt động: `const activeCount = classes.filter((c) => c.status === "active").length;`
   - Cập nhật PageHead: `<PageHead title="Lớp học" lead={`${activeCount} lớp đang hoạt động`} />`
   - Kết quả: khi bảng trống hiện `0 lớp đang hoạt động`; khi có N lớp active hiện đúng `N lớp đang hoạt động`.

2. **Students list page (`apps/web/src/routes/_auth/students/index.tsx`):**
   - Import `useData` từ `@/lib/data-store`.
   - Lấy `data` từ `useData()`.
   - Tính toán danh sách student IDs có hóa đơn chưa thu:
     ```ts
     const unpaidStudentIds = new Set(
       data.invoices
         .filter((i) => i.status !== "paid")
         .map((i) => i.sid),
     );
     ```
   - Tính toán số học viên cần chú ý:
     ```ts
     const attentionCount = students.filter(
       (s) =>
         s.tags.includes("nợ học phí") ||
         s.tags.includes("sắp hết buổi") ||
         (s.pkg.total > 0 && s.pkg.remaining <= 4) ||
         unpaidStudentIds.has(s.id),
     ).length;
     ```
   - Cập nhật PageHead:
     `<PageHead title="Học viên" lead={`${students.length} học viên đang học · ${attentionCount} cần chú ý (nợ học phí / sắp hết gói)`} />`
   - Kết quả: khi bảng trống hiện `0 học viên đang học · 0 cần chú ý (nợ học phí / sắp hết gói)`.

3. **Assignments list page (`apps/web/src/routes/_auth/assignments/index.tsx`):**
   - Đếm số bài tập cần xử lý:
     `const pendingCount = data.assignments.filter((a) => a.status !== "graded").length;`
   - Cập nhật PageHead:
     `<PageHead title="Bài tập" lead={`${data.assignments.length} bài tập · ${pendingCount} cần xử lý`} />`
   - Kết quả: khi bảng trống hiện `0 bài tập · 0 cần xử lý`; khi có N bài tập hiện đúng tổng số bài và số bài chưa chấm.

4. **Contract tests (`apps/web/src/lib/kernel-runtime.contract.test.ts`):**
   - Thêm test `list pages derive KPI counters dynamically from kernel store (#106)`:
     - `classes/index.tsx`: cấm chuỗi literal `"3 lớp đang hoạt động"`
     - `students/index.tsx`: cấm chuỗi literal `"5 học viên đang học"`, cấm `"2 cần chú ý"`
     - `assignments/index.tsx`: cấm chuỗi literal `"6 bài tập · 3 cần xử lý"`, cấm `"6 bài tập"`, cấm `"3 cần xử lý"`
     - Assert các route có cấu trúc template string động tương ứng.

## Verification

- `pnpm --filter web test` (chạy vitest cho web package)
- `pnpm test` (toàn bộ workspace tests)
- `pnpm check-types` (typecheck)
- `pnpm check` (biome formatting và linter)
