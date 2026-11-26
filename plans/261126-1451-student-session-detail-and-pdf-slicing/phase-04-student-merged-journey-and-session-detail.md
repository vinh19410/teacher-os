---
phase: 4
title: "Student Merged Journey Tab & Session Detail Page"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 4: Student Merged Journey Tab & Session Detail Page

## Goal

Gộp tab **"Hành trình học"** và **"Giáo trình"** thành một tab **"Hành trình học"** duy nhất trên trang chi tiết lớp học viên (`/classes/$classId`), nhóm buổi theo từng Module giáo trình kèm tiến độ (giữ timeline phẳng khi lớp không có giáo trình), làm từng buổi có ngày bấm vào được để mở trang chi tiết `/classes/$classId/sessions/$date` hiển thị đầy đủ **Bài giảng** (xem trước PDF + nhãn trang cắt từ sách gốc + tải xuống) và **Bài tập của buổi** (bài tập tương tác bấm Làm ngay/Xem lại + file/link bài tập giáo viên upload).

## Files to Create / Modify

- Modify: `apps/student/src/lib/repos/student.ts` — thêm `fetchStudentSessionDetail`, `useStudentSessionDetail` (query key `["student", "class", classId, "session", date]`, `staleTime: 60_000`), và giữ nguyên helper blob/download URL cho `lessonMaterialFileUrl`.
- Modify: `apps/student/src/components/class/class-detail-view.tsx` — rút `CLASS_TABS` còn 3 tab (`Hành trình học`, `Bài tập`, `Tài liệu chung`), bỏ `SyllabusTab` cũ, truyền `syllabus` vào `ClassLessonList`.
- Modify: `apps/student/src/components/class/class-lesson-list.tsx` — hiển thị thanh tiến độ tổng giáo trình & nhóm buổi theo Module (dùng `<div role="region">`, KHÔNG lồng `<li>` để giữ tổng số `<li>` trong section "Buổi học" khớp đúng số buổi) CHỈ KHI có `syllabus` và ít nhất 1 buổi có `moduleId` (lớp legacy `date: null` kể cả có syllabus vẫn fallback về timeline phẳng); luôn bảo toàn 100% buổi trong `detail.lessons` (buổi `holiday` gắn xen kẽ theo trình tự thời gian vào module liền kề và không tính vào mẫu số tiến độ; buổi vượt số tiết giáo trình vào cụm `"Buổi học bổ sung"` ở cuối); gỡ `LessonMaterialsDisclosure` cũ để tránh trùng lặp với trang chi tiết buổi; mỗi buổi có ngày (trừ `holiday`) có liên kết điều hướng tới `/classes/$classId/sessions/$date` (dùng stretched-link sạch a11y, không lồng interactive element trong `<a>`, giữ `ZoomJoinButton` và link recording nổi ở `relative z-10`), hiển thị badge số bài giảng & bài tập (`X bài giảng`, `Y bài tập`) và chevron chỉ thị bấm được. <!-- Red-Team RT-5, RT-7 -->
- Create: `apps/student/src/components/class/session-detail-view.tsx` — giao diện trang chi tiết buổi học: nút quay lại lớp, header buổi (buổi số, module, ngày/giờ/thời lượng, trạng thái, Zoom/Recording có lọc `isSafeMaterialUrl(recordingUrl)`, mục tiêu giáo trình), khối **Bài giảng** (hiển thị badge nguồn trang sách `Trang X–Y` / `Từ sách: ...`, thumbnail xem trước PDF/ảnh + nút mở xem toàn màn hình + tải xuống + phát media/mở link), khối **Bài tập của buổi** (bảng/danh sách bài tập tương tác có nút Làm ngay/Xem lại/Nhận xét + danh sách file/link bài tập upload), điều hướng `← Buổi trước` / `Buổi tiếp theo →`, cùng `SessionNotFound`. <!-- Red-Team RT-11 -->
- Create: `apps/student/src/routes/_auth/classes/$classId_.sessions.$date.tsx` — route TanStack Router non-nested tại `/classes/$classId/sessions/$date` (guard giống `$classId.tsx`: loading, `NOT_LINKED`, `TEACHER_ON_STUDENT_PORTAL`, onboarding, 404 → `SessionNotFound`).
- Modify: `apps/student/src/components/class/lesson-materials.tsx` — hỗ trợ hiển thị badge trang sách gốc (`sourcePageStart`–`sourcePageEnd` / `sourceTitle`) trên `StudentMaterialRow` để tái dùng sạch cho cả trang chi tiết buổi.
- Regenerate: `apps/student/src/routeTree.gen.ts` (tự sinh qua build/router plugin của Vite).
- Create / Modify tests:
  - Create: `apps/student/src/components/class/session-detail-view.test.tsx`
  - Modify: `apps/student/src/components/class/class-detail-view.test.tsx`
  - Modify: `apps/student/src/components/class/class-lesson-list.test.tsx`
  - Modify: `apps/student/test/class-detail.test.tsx`

## Tests Before (TDD)

1. Cập nhật & thêm unit test trong `apps/student/src/components/class/class-detail-view.test.tsx` và `apps/student/test/class-detail.test.tsx`:
   - Thanh tab chỉ còn đúng 3 tab: `["Hành trình học", "Bài tập", "Tài liệu chung"]`, không còn `class-tab-syllabus` hay `class-tab-classmates`.
   - Tab `Hành trình học` hiển thị tiến độ theo Module giáo trình khi có `syllabus` (vd `Module 1 · 1/2 buổi`, tick hoàn thành khi mọi buổi không phải holiday đều `completed`).
2. Cập nhật `apps/student/src/components/class/class-lesson-list.test.tsx`:
   - Buổi có ngày (active/completed/upcoming/ended) có link trỏ tới `/classes/$classId/sessions/$date`, hiển thị badge số bài giảng và bài tập khi > 0.
   - Buổi `holiday` và lớp legacy (`date: null`) không tạo link tới trang chi tiết buổi không hợp lệ.
   - Không có interactive element lồng nhau (Zoom/Recording vẫn bấm độc lập).
3. Viết `apps/student/src/components/class/session-detail-view.test.tsx`:
   - Render đầy đủ header buổi, mục tiêu giáo trình, nút quay lại lớp.
   - Render khối **Bài giảng** với nhãn `Trang 1–12` và tên sách gốc; empty state rõ ràng khi chưa có bài giảng.
   - Render khối **Bài tập của buổi** với cả bài tập tương tác (link `/learn/quizzes/$assignmentId`) lẫn file bài tập upload; empty state ghi rõ bài tập có thể cập nhật trước hoặc sau buổi học.
   - Render nút điều hướng `Buổi trước` / `Buổi tiếp theo` đúng `prevSessionDate` / `nextSessionDate`.
   - Buổi thuộc lớp tạm dừng hiển thị banner tạm dừng trung tính nhưng vẫn xem được bài giảng & làm bài tập.

## Implementation Steps

1. Thêm `fetchStudentSessionDetail` & `useStudentSessionDetail` vào `apps/student/src/lib/repos/student.ts`.
2. Mở rộng `StudentMaterialRow` trong `apps/student/src/components/class/lesson-materials.tsx` hiển thị badge nguồn sách/trang (`Trang X–Y` + `sourceTitle`) khi có.
3. Cập nhật `apps/student/src/components/class/class-detail-view.tsx` gộp 2 tab thành 1 (`CLASS_TABS` 3 mục), truyền `syllabus` vào `ClassLessonList`.
4. Nâng cấp `apps/student/src/components/class/class-lesson-list.tsx` hỗ trợ nhóm theo Module giáo trình kèm tiến độ từng module, giữ timeline phẳng cho lớp không giáo trình, thêm link sang `/classes/$classId/sessions/$date` và đếm bài giảng/bài tập.
5. Tạo `apps/student/src/components/class/session-detail-view.tsx` và route `apps/student/src/routes/_auth/classes/$classId_.sessions.$date.tsx`.
6. Chạy `pnpm --filter student build` để TanStack Router sinh lại `apps/student/src/routeTree.gen.ts` và kiểm tra không lỗi type.
7. Cập nhật `DESIGN.md` mục chi tiết lớp học viên nếu hành vi user-facing/cấu trúc tab thay đổi.

## Tests After

1. Chạy toàn bộ test suite `apps/student` (`pnpm --filter student test`) và `pnpm --filter student check-types`.

## Regression Gate

```bash
pnpm --filter student check-types && pnpm --filter student test && pnpm --filter student build
```

## Todo

- [ ] Viết/cập nhật test TDD cho 3 tab, module grouping, clickable sessions và `SessionDetailView`.
- [ ] Thêm client repo hook `useStudentSessionDetail`.
- [ ] Gộp tab và nâng cấp `ClassLessonList` với module grouping + clickable session links.
- [ ] Triển khai `SessionDetailView` và route `$classId_.sessions.$date.tsx`.
- [ ] Sinh lại `routeTree.gen.ts` và chạy regression gate Phase 4 xanh.
