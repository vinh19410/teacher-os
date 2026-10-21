# Phase 01 — Helper `isLessonEnded`, badge "Đã kết thúc", test

## Files được sửa
- `apps/student/src/components/class/class-lesson-list.tsx`
- `apps/student/src/components/class/class-detail-view.tsx` (truyền `now`)
- `apps/student/src/components/class/class-info-card.tsx` (truyền `now` cho `findNextLessonId` — đồng bộ Tổng quan, resolve câu hỏi mở 3)
- `apps/student/src/routes/_auth/classes/$classId.tsx` (truyền `now={new Date()}`)
- `apps/student/test/class-detail.test.tsx`, `apps/student/test/class-primitives.test.tsx` (nếu cần)

## Steps
1. Thêm `export function isLessonEnded(lesson, now: Date): boolean` trong `class-lesson-list.tsx`: trả `true` khi `status === "upcoming"`, `date != null` và `new Date(`${date}T${time}:00+07:00`).getTime() + dur * 60_000 <= now.getTime()`. `time` hiện dạng `HH:MM` (ví dụ `18:30` trong test); nếu giá trị lạ làm `Date` ra `NaN` thì trả `false` (không đoán).
2. Thêm prop `now: Date` vào `ClassLessonList`, `ClassDetailView` và `ClassInfoCard`; route tạo `const now = new Date()` **một lần** rồi truyền `todayISO={vietnamTodayISO(now)}` và `now={now}` từ cùng giá trị (kongming: `vietnamTodayISO` nhận `now?: Date` — `packages/api/src/vietnam-date.ts:27`).
3. Thêm key hiển thị `ended` vào `LESSON_STATUS` (`label: "Đã kết thúc"`, `variant: "outline"`, `badgeClass: "text-muted-foreground"`); trong render, suy ra `displayStatus = isLessonEnded(...) ? "ended" : lesson.status`.
4. Dấu chấm timeline cho `ended`: icon `Clock` nền `bg-muted text-muted-foreground` — KHÔNG dùng `X` (trùng nghĩa "Vắng"/"Đã huỷ", dễ khiến học viên tưởng bị ghi vắng; kongming condition 4), không gạch ngang chủ đề.
5. `findNextLessonId(lessons, todayISO, now: Date)` — `now` bắt buộc, bỏ qua buổi đã `isLessonEnded`, để buổi hôm nay đã qua giờ không bị chọn làm "Buổi tới" ở **cả** tab Hành trình học lẫn thẻ Tổng quan (`class-info-card.tsx:98`, null-safe sẵn: không có ứng viên → ẩn dòng "Buổi tới"). Cập nhật chỗ tính `future` cho khớp.

## Test (viết trước)
- `isLessonEnded`: upcoming + quá `time+dur` → true; upcoming + chưa tới giờ kết thúc → false; ranh giới đúng bằng giờ kết thúc → true; **buổi 23:30 + 90 phút kết thúc qua nửa đêm ngày hôm sau → true** (kongming condition 3); `completed|absent|cancelled` → false; `date = null` → false; `time` sai định dạng → false.
- Ghép cặp thời gian trong test: `TODAY = "2099-03-10"` đi với `NOW = new Date("2099-03-10T12:00:00+07:00")` — không dùng `new Date()` thật trong assertion của helper (sẽ luôn "chưa kết thúc" với data năm 2099).
- Test cũ đòi "Sắp tới" mà data đã hết buổi upcoming tương lai: **thêm data** (`l6` upcoming 2099-03-20) để giữ assertion, không xoá assertion (kongming condition 2).
- `ClassLessonList` SSR với `now` cố định: có badge "Đã kết thúc" cho buổi quá hạn, không có "Buổi tới" gán cho buổi đã kết thúc, buổi tương lai gần nhất vẫn là "Buổi tới".
- `findNextLessonId` với `now`: buổi hôm nay đã qua giờ kết thúc không được chọn; `ClassInfoCard` với chỉ toàn buổi đã kết thúc → không có dòng "Buổi tới" (null-safe).
- Cập nhật các test hiện có đang giả định buổi upcoming quá khứ hiện "Sắp tới".

## Validation
- Local gates tương đương CI (develop KHÔNG có CI — `ci.yml`/`e2e.yml` chỉ target `main`; kongming cảnh báo): `pnpm exec biome check .` (KHÔNG dùng `pnpm check` vì có `--write` tự sửa, che lỗi), `pnpm test` full repo, `pnpm check-types`, `pnpm build`, `pnpm --filter student test`.
- UI: kiểm 3 viewport (1440×900, 768×1024, 375×812) + focus bàn phím theo `REVIEW.md`; PR kèm screenshot.
- E2E: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` (spec `student-class-detail`). Seed spec không có buổi upcoming hôm nay nên không flaky; nếu thêm case E2E thì dùng `addDaysISO(today, -2)` + status upcoming (ổn định mọi giờ chạy), cập nhật `toHaveCount`/`nth()` tương ứng. Full suite trước khi squash-merge.

## Known inconsistency (non-goal, ghi trong PR + issue follow-up)
- Dashboard học viên (`overview/class-card.tsx`, `upcoming-sessions.tsx`) lấy "Buổi tới" từ `loadNextSession` server (`student-class.ts:84`, `gte(date, todayISO)`) — vẫn có thể chỉ buổi hôm nay đã qua giờ. Không mở rộng PR này sang server.

## Risk / Rollback
- Rủi ro: lệch múi giờ trình duyệt. Giảm bằng offset `+07:00` tường minh (không dùng giờ máy). (Red-team: student là Vite SPA thuần — `main.tsx` dùng `RouterProvider`, không SSR — nên rủi ro hydration không áp dụng; test render bằng `renderToStaticMarkup`.)
- `time` ngoài định dạng (row legacy trước `TIME_REGEX`) → `Date` ra `NaN` → `isLessonEnded` trả `false`, giữ hiển thị cũ (không đoán).
- Rollback: revert một commit, không có migration hay đổi dữ liệu.
