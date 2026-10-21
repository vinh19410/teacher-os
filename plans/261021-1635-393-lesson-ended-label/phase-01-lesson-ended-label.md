# Phase 01 — Helper `isLessonEnded`, badge "Đã kết thúc", test

## Files được sửa
- `apps/student/src/components/class/class-lesson-list.tsx`
- `apps/student/src/components/class/class-detail-view.tsx` (truyền `now`)
- `apps/student/src/components/class/class-info-card.tsx` (truyền `now` cho `findNextLessonId` — đồng bộ Tổng quan, resolve câu hỏi mở 3)
- `apps/student/src/routes/_auth/classes/$classId.tsx` (truyền `now={new Date()}`)
- `apps/student/test/class-detail.test.tsx`, `apps/student/test/class-primitives.test.tsx` (nếu cần)

## Steps
1. Thêm `export function isLessonEnded(lesson, now: Date): boolean` trong `class-lesson-list.tsx`: trả `true` khi `status === "upcoming"`, `date != null` và `new Date(`${date}T${time}:00+07:00`).getTime() + dur * 60_000 <= now.getTime()`. `time` hiện dạng `HH:MM` (ví dụ `18:30` trong test); nếu giá trị lạ làm `Date` ra `NaN` thì trả `false` (không đoán).
2. Thêm prop `now: Date` vào `ClassLessonList` và `ClassDetailView`; route truyền `new Date()`. `todayISO` giữ nguyên cho phần còn lại.
3. Thêm key hiển thị `ended` vào `LESSON_STATUS` (`label: "Đã kết thúc"`, `variant: "outline"`, `badgeClass: "text-muted-foreground"`); trong render, suy ra `displayStatus = isLessonEnded(...) ? "ended" : lesson.status`.
4. Dấu chấm timeline cho `ended`: dùng icon `X` với nền `bg-muted text-muted-foreground` như `cancelled` nhưng không gạch ngang chủ đề.
5. `findNextLessonId(lessons, todayISO, now: Date)` — `now` bắt buộc, bỏ qua buổi đã `isLessonEnded`, để buổi hôm nay đã qua giờ không bị chọn làm "Buổi tới" ở **cả** tab Hành trình học lẫn thẻ Tổng quan (`class-info-card.tsx:98`, null-safe sẵn: không có ứng viên → ẩn dòng "Buổi tới"). Cập nhật chỗ tính `future` cho khớp.

## Test (viết trước)
- `isLessonEnded`: upcoming + quá `time+dur` → true; upcoming + chưa tới giờ kết thúc → false; ranh giới đúng bằng giờ kết thúc → true; `completed|absent|cancelled` → false; `date = null` → false; `time` sai định dạng → false.
- `ClassLessonList` SSR với `now` cố định: có badge "Đã kết thúc" cho buổi quá hạn, không có "Buổi tới" gán cho buổi đã kết thúc, buổi tương lai gần nhất vẫn là "Buổi tới".
- `findNextLessonId` với `now`: buổi hôm nay đã qua giờ kết thúc không được chọn; `ClassInfoCard` với chỉ toàn buổi đã kết thúc → không có dòng "Buổi tới" (null-safe).
- Cập nhật các test hiện có đang giả định buổi upcoming quá khứ hiện "Sắp tới".

## Validation
- `pnpm --filter student test` rồi `pnpm check` và `pnpm check-types`.
- UI: kiểm 3 viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md`; PR kèm screenshot.
- E2E: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` (spec `student-class-detail`), sau đó full suite trước khi squash-merge.

## Risk / Rollback
- Rủi ro: lệch múi giờ trình duyệt. Giảm bằng offset `+07:00` tường minh (không dùng giờ máy). (Red-team: student là Vite SPA thuần — `main.tsx` dùng `RouterProvider`, không SSR — nên rủi ro hydration không áp dụng; test render bằng `renderToStaticMarkup`.)
- `time` ngoài định dạng (row legacy trước `TIME_REGEX`) → `Date` ra `NaN` → `isLessonEnded` trả `false`, giữ hiển thị cũ (không đoán).
- Rollback: revert một commit, không có migration hay đổi dữ liệu.
