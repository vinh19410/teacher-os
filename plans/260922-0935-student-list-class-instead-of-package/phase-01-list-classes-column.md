---
phase: 1
title: "Cột Lớp học thay các cột gói trong danh sách học viên"
status: pending
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Cột Lớp học thay các cột gói trong danh sách học viên

## Context Links

- Pattern tham chiếu: PR #245 — card Lớp học trên tab Hồ sơ (`apps/web/src/routes/_auth/students/$studentId.tsx:78-82,145-173`)
- Plan cha: [plan.md](./plan.md)

## Key Insights

- `data.enrollments` + `data.classes` đã có sẵn trong kernel snapshot mà route list đã đọc qua `useData()` (`index.tsx:30`) — không cần thêm fetch hay đổi API.
- Route chi tiết đang giữ inline join enrollments×classes (`$studentId.tsx:78-82`); list cần đúng join đó → tách helper, tránh 2 bản sao.
- `s.pkg`/`s.hasPackage` vẫn cần cho `attentionCount` (`index.tsx:42`) — chỉ bỏ phần trình bày, không đụng adapter `mapStudents`.
- `fmtVND` ở `index.tsx:12` chỉ còn dùng cho cell Đơn giá → xóa import sau khi bỏ cell.

## Requirements

- [ ] Headers bảng: `["Học viên", "Gói", "Còn lại", "Tags", "Đơn giá"]` → `["Học viên", "Lớp học", "Tags"]`
- [ ] Cell Lớp học: mỗi lớp 1 khối (tên lớp `font-medium text-sm` + meta `classMeta(c)` dạng `font-mono text-meta text-xs`), stack dọc khi nhiều lớp
- [ ] Học viên không lớp: cell hiện "Chưa có lớp"
- [ ] Cell là text thuần, không `Link` (row đã onClick → detail)
- [ ] Unit test cho helper mới

## Related Code Files

- Modify: `apps/web/src/lib/repos/enrollments.ts` — thêm pure helper `classesByStudent`
- Modify: `apps/web/src/routes/_auth/students/index.tsx` — thay 3 cột gói bằng cột Lớp học
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx` — dùng lại `classesByStudent`, bỏ inline join
- Create: `apps/web/src/lib/repos/enrollments.test.ts` — unit test helper

## Implementation Steps

1. Trong `apps/web/src/lib/repos/enrollments.ts` thêm helper pure (signature tham chiếu shape hiển thị đã map, không import provider):
   ```ts
   export function classesByStudent(
     data: Pick<KernelHydratedData, "classes" | "enrollments">,
     studentId: string,
   ): ClassGroup[]
   ```
   body: `data.classes.filter((c) => data.enrollments.some((e) => e.studentId === studentId && e.classId === c.id))` — copy nguyên tắc join từ `$studentId.tsx:78-82`. Import type `KernelHydratedData`, `ClassGroup` từ `@/lib/mock-data`.
2. Tạo `apps/web/src/lib/repos/enrollments.test.ts` theo style `students.test.ts` (vitest, fixture inline): student thuộc 1 lớp → trả đúng lớp đó; student thuộc nhiều lớp → đủ và giữ thứ tự của `data.classes`; student không enrollment → `[]`; enrollment trỏ classId không tồn tại → bị bỏ qua.
3. Sửa `apps/web/src/routes/_auth/students/index.tsx`:
   - Đổi `headers` thành `["Học viên", "Lớp học", "Tags"]`.
   - Trong `rows={list.map((s) => ...)}`: tính `const classes = classesByStudent(data, s.id)`; thay 3 cells "pkg"/"remaining"/"price" bằng 1 cell "classes" — stack dọc các khối tên + `classMeta(c)`, rỗng thì render `<span className="font-mono text-meta text-xs">Chưa có lớp</span>`.
   - Xóa import `fmtVND` (không còn dùng); thêm import `classesByStudent` từ `@/lib/repos/enrollments` và `classMeta` từ `@/lib/mock-data`.
   - Giữ nguyên: `attentionCount`, lead text, ChipFilter, empty states, `AddStudentModal`.
4. Sửa `apps/web/src/routes/_auth/students/$studentId.tsx`: thay khối `const studentClasses = data.classes.filter(...)` bằng `const studentClasses = classesByStudent(data, studentId)`; phần render card giữ nguyên.
5. Chạy verification (mục Verification) — tất cả phải pass.

## Verification

- `pnpm check-types`
- `pnpm --filter web test`
- `pnpm exec biome check apps/web/src apps/e2e/specs`

## Risk Assessment

- **Row click + cell render nhiều dòng**: cell cao hơn khi học viên nhiều lớp — DataTable đã flex-wrap các row khác, chấp nhận chiều cao thay đổi; không đổi component DataTable.
- **Regression attentionCount**: không đụng logic; `pnpm --filter web test` + dashboard/tuition test có sẵn sẽ bắt.

## Security Considerations

- `useData()` trả snapshot đã org-scoped (đã xác minh ở #245) — join cùng snapshot nên không rò rỉ lớp của org khác.
