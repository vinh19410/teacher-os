---
title: "Phase 1: Card Lớp học thay card Gói học trong tab Hồ sơ"
status: todo
---

# Phase 1: Card Lớp học thay card Gói học trong tab Hồ sơ

## Context Links

- Plan: [plan.md](./plan.md)
- Chỗ sửa chính: `apps/web/src/routes/_auth/students/$studentId.tsx:141-206` (khối tab "profile")
- Quyết định D2 #240 (học viên ngoài lớp không có gói): `plans/260922-0716-student-create-identity-fields/plan.md`

## Overview

- **Priority**: P1
- **Status**: todo
- Thay card "Gói học" (dòng 143–181) bằng card "Lớp học": liệt kê các lớp học viên đang tham gia (join `data.enrollments` × `data.classes`), mỗi lớp là link tới class detail kèm meta dòng `classMeta(c)`. Chưa có lớp → empty state.

## Key Insights

- Route đã gọi `useData()` (`$studentId.tsx:67`) và đã tự scope `lessons/invoices/assignments` theo `studentId` (dòng 76–78) — thêm `studentClasses` theo đúng pattern này, không cần đổi mapper/API.
- `data.enrollments` là `KernelEnrollmentRow[]` (`{id, classId, studentId, createdAt}` — xem `apps/web/src/lib/repos/enrollments.ts`); `data.classes` là `ClassGroup[]` (có `name`, `level`, `skills`, `mode` — `apps/web/src/lib/mock-data.ts:149-166`).
- Một học viên có thể thuộc nhiều lớp (`enrollment` unique `(classId, studentId)` — `packages/db/src/schema/enrollment.ts:35-38`) → card render danh sách, không giả định 1 lớp.
- Helper sẵn có: `classMeta(c)` (`apps/web/src/lib/mock-data.ts:242`) trả về "level · skills · mode".
- Sau khi bỏ card gói: import `Progress` (dòng 9) không còn dùng phải xóa; `fmtVND` giữ lại (tab Học phí dòng 236 vẫn dùng).

## Requirements

- [ ] Card "Lớp học" đứng cùng vị trí grid với card "Gói học" cũ (cột trái, trước card Phụ huynh).
- [ ] Header card giữ style hiện tại: `font-mono text-[11px] text-meta uppercase tracking-[0.06em]`.
- [ ] Mỗi lớp: tên lớp là `Link` tới `/classes/$classId` (style như link bài tập dòng 255–260: `font-medium text-accent-blue hover:text-accent-active`) + dòng meta `classMeta(c)` với `font-mono text-meta text-xs`.
- [ ] Không có lớp → `<p className="text-muted-fg text-sm">Chưa tham gia lớp học nào.</p>`
- [ ] Không còn tham chiếu `student.hasPackage`/`student.pkg` trong file.

## Related Code Files

- Modify: `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/routes/_auth/students/$studentId.tsx` (file duy nhất của phase này)

## Implementation Steps

1. Trong `StudentDetailRoute`, sau khối biến `lessons/invoices/assignments` (dòng 76–78), thêm join:
   ```tsx
   const studentClasses = data.classes.filter((c) =>
       data.enrollments.some(
           (e) => e.studentId === studentId && e.classId === c.id,
       ),
   );
   ```
2. Sửa import từ `@/lib/mock-data` (dòng 15): thêm `classMeta`.
3. Thay toàn bộ card "Gói học" (dòng 143–181) bằng:
   ```tsx
   <Card variant="white">
       <div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.06em]">
           Lớp học
       </div>
       {studentClasses.length > 0 ? (
           <div className="flex flex-col gap-4">
               {studentClasses.map((c) => (
                   <div key={c.id}>
                       <Link
                           to="/classes/$classId"
                           params={{ classId: c.id }}
                           className="font-medium text-accent-blue hover:text-accent-active"
                       >
                           {c.name}
                       </Link>
                       <div className="mt-1 font-mono text-meta text-xs">
                           {classMeta(c)}
                       </div>
                   </div>
               ))}
           </div>
       ) : (
           <p className="text-muted-fg text-sm">Chưa tham gia lớp học nào.</p>
       )}
   </Card>
   ```
4. Xóa import `Progress` (dòng 9).

## Todo

- [ ] Thêm biến `studentClasses` (join enrollments × classes)
- [ ] Import `classMeta`, xóa import `Progress`
- [ ] Thay card "Gói học" bằng card "Lớp học" + empty state
- [ ] Kiểm tra không còn `Gói học`/`hasPackage`/`student.pkg` trong file

## Success Criteria

- Tab Hồ sơ hiển thị card "Lớp học"; học viên nhiều lớp thấy đủ các lớp; chưa có lớp thấy empty state.
- `grep -n 'Gói học\|hasPackage\|student\.pkg' apps/web/src/routes/_auth/students/\$studentId.tsx` trả về rỗng.
- `pnpm check-types` pass (repo root).

## Risk Assessment

- Thấp: `studentClasses` tính mỗi render — snapshot quy mô giáo viên là nhỏ; nếu đo thấy chậm mới bọc `useMemo` (YAGNI).
- Chỉ presentation, không đụng logic ghi/entitlement (`session_package` không đổi).

## Security Considerations

- Không đổi authz: dữ liệu đọc từ kernel snapshot (`GET /api/kernel`) vốn đã scoped theo org.

## Next Steps

- Phase 2: cập nhật E2E khớp text mới và chạy verification.
