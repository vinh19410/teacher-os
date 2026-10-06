---
phase: 1
title: "Popup /schedule đọc trạng thái theo đúng buổi + chặn điểm danh tương lai (UI)"
status: completed
effort: "0.75d"
---

# Phase 1 — Popup /schedule đọc trạng thái theo đúng buổi

## Context

- `apps/web/src/components/schedule/class-session-modal.tsx` — dùng `findSessionRows` + `distinctStudentsBySid`; với lớp undated, mỗi HV lấy row UUID nhỏ nhất của cả khoá.
- `apps/web/src/lib/class-sessions.ts` — model của tab chi tiết lớp: `buildClassSessions` (legacy prefix + v2 dated), `sidStateAt`, `isSequentialHead`, `firstUpcomingLessonId`, `sessionIsEligibleDate`, `sessionAttendanceState`.
- `apps/web/src/routes/_auth/schedule.tsx:71,235-248` — card grid dùng `s.status` = `rollupSessionStatus` trên mọi row của entry (legacy = cả khoá).
- `apps/web/src/lib/schedule-week.ts` — `WeekSessionEntry`, `findSessionRows`, `distinctStudentsBySid`.
- Lịch legacy: `schedule.days` 0-6 Mon-first, `lesson.day` 1-7 Mon=1 (đã khớp trong `buildClassSessions`).

## Requirements

1. Thêm helper thuần trong `class-sessions.ts` trả trạng thái **từng HV tại một buổi**, dùng cho cả legacy và v2, KHÔNG gộp thành aggregate "future":
   ```ts
   export interface OccurrenceSidState {
     sid: string;
     status: SessionStatus;            // completed | cancelled | upcoming
     /** Row để Hủy/Sửa/Điểm danh; null = không có row hợp lệ để ghi. */
     targetLessonId: string | null;
     /** Hủy/Sửa: có `targetLessonId`; KHÔNG phụ thuộc ngày (quyết định #1: buổi tương lai vẫn Hủy/Sửa được). */
     canCancelEdit: boolean;
     /** Điểm danh: có `targetLessonId` && ngày buổi <= hôm nay. */
     canCheckIn: boolean;
   }
   export function occurrenceSidStates(session: ClassSession, todayISO: string): OccurrenceSidState[]
   ```
   - v2: row của HV trong bucket là sự thật; `status` giữ logic `sessionAttendanceState` v2 branch (`absent` → upcoming cho badge/rollup); **`targetLessonId` chỉ có khi `row.status === "upcoming"` (strict)** — row `absent` hiển thị badge "Vắng mặt" nhưng KHÔNG có nút (server chỉ nhận row `upcoming`, `kernel.ts` `lessonStatusAction`). Khi refactor `sessionAttendanceState` dùng chung helper, output hiện tại của nó không được đổi.
   - legacy: `status = sidStateAt(stats, slotIndex)`; `targetLessonId` = `firstUpcomingLessonId` **chỉ khi** `isSequentialHead`; ngược lại null. Hệ quả cần ghi vào PR: trước backfill, legacy chỉ điểm danh được theo thứ tự đầu→cuối (buổi 06/10 của Lớp Test 1 chưa điểm danh được vì head là buổi sớm hơn chưa chốt).
   - `canCancelEdit = targetLessonId !== null`; `canCheckIn = canCancelEdit && sessionIsEligibleDate(session, todayISO)`.
   - `sidStateAt`, `isSequentialHead`, `slotStatsBySid` là hàm **private** của `class-sessions.ts` → helper mới phải nằm trong cùng file.
   - Tái dùng `sessionStudents(session)` cho thứ tự HV. Cân nhắc refactor `sessionAttendanceState` gọi helper mới để không lặp logic (DRY) — giữ nguyên output hiện tại (test class-sessions phải xanh không sửa).
2. Thêm helper tìm buổi trong `schedule-week.ts` (hoặc `class-sessions.ts`):
   ```ts
   export function findClassOccurrence(cls: ClassGroup, lessons: Lesson[], ref: SessionRef & { columnDateISO?: string }): ClassSession | null
   ```
   - **Ref có ngày (`ref.dateISO != null`) → chỉ dựng occurrence v2 từ bucket `d:{classId}:{date}`** (cùng logic `buildClassSessionsV2`), KHÔNG đi qua `buildClassSessions` cả lớp. Lý do: lớp trộn (row cũ undated + học viên ghi danh sau #98 có `date`, `enrollment-activation.ts`) làm cổng v2 của `buildClassSessions` (`class-sessions.ts:215`, yêu cầu MỌI row có date) rơi về nhánh legacy và tính prefix sai cho row đã có ngày.
   - Ref undated (`ref.dateISO == null`): lọc `lessons` theo `classId`, gọi `buildClassSessions({ schedule, startDate, lessons, sessionsTotal })`, trả session có `dateISO === ref.columnDateISO` và `time === ref.time`.
   - Hàm trả kết quả phân biệt được "không dựng được model" (`buildClassSessions` null: lịch không parse được / divergent) với "dựng được nhưng cột ngày này ngoài lịch" (không có session khớp) — card grid xử lý khác nhau (R4).
3. `ClassSessionModal`:
   - Lấy `occurrence = findClassOccurrence(...)`. Có occurrence → render danh sách HV từ `occurrenceSidStates(occurrence, todayISOVietnam())`.
   - Badge: completed → "Hoàn thành", cancelled → "Đã hủy", upcoming → "Sắp tới". Row có `status === "absent"` trên v2 hiển thị "Vắng mặt" như hiện tại (đọc từ row target nếu có).
   - Nút **Sửa / Hủy** khi `canCancelEdit`; nút **Điểm danh** chỉ khi `canCheckIn`. Mọi action gửi `targetLessonId` (không còn `row.id` tuỳ ý).
   - Không dựng được occurrence (legacy divergent / lịch free-text) → fallback **giữ hành vi row-based hiện tại** (distinct HV, Điểm danh/Hủy/Sửa theo row như cũ) — vì tab Buổi học của lớp ở trường hợp này cũng chỉ là bảng chỉ-đọc (`class-schedule-table.tsx` khi `sessions === null`), không còn chỗ nào khác để điểm danh. Chỉ thêm: ẩn Điểm danh khi row có `date > today` (server cũng chặn). Không thêm dòng gợi ý chuyển tab.
   - Giữ nguyên hành vi edit form, focus restore, `role="group"` + `aria-label` (e2e dựa vào).
4. Card grid `schedule.tsx`: với entry legacy (`dateISO === null`), trạng thái card = `sessionStatus(occurrence)` của buổi trong cột ngày đang xem; entry v2 giữ `rollupSessionStatus`. Truyền `columnDateISO` như modal. Khi model dựng được nhưng cột ngày **ngoài lịch** (tuần trước `startDate`/sau buổi cuối — hiện `selectWeekColumnLessons` hiển thị row undated ở MỌI tuần) → ẩn card (không phantom). Khi model không dựng được (divergent) → giữ `rollupSessionStatus` như cũ.
5. `schedule/lesson-modal.tsx` (popup 1:1) **không còn được mount ở đâu** (chỉ `kernel-runtime.contract.test.ts` đọc source của nó) → không sửa; server guard (phase 2) vẫn bao phủ nếu sau này được gắn lại.
6. "Hôm nay" dùng `todayISOVietnam` từ `@/lib/week-grid` — cùng helper `schedule.tsx` và `session-attendance-modal.tsx` đang dùng.

## Files

- Modify: `apps/web/src/lib/class-sessions.ts`, `apps/web/src/lib/schedule-week.ts`, `apps/web/src/components/schedule/class-session-modal.tsx`, `apps/web/src/routes/_auth/schedule.tsx`
- Tests: `apps/web/src/lib/class-sessions.test.ts`, `apps/web/src/lib/class-sessions.v2.test.ts`, `apps/web/src/lib/schedule-week.test.ts`
- E2E (bắt buộc): `apps/e2e/specs/class-operations.spec.ts` (xem Steps 6), `apps/e2e/specs/schedule-session-modal.spec.ts`; grep thêm các spec khác dùng "Điểm danh" (`session-occurrence`, `projected-sessions`, `student-class-detail`) và sửa spec nào check-in buổi tương lai.

## Steps

1. Viết test trước cho `occurrenceSidStates`:
   - Legacy 2 sid × 13 buổi Thứ Ba, mỗi sid 1 completed (UUID completed của sid B nhỏ hơn upcoming) → slot 1: cả 2 completed; slot 7 (tương lai): cả 2 upcoming, `canCheckIn=false`; slot 2 với today ≥ slot 2: cả 2 upcoming, `targetLessonId` = row upcoming id-asc đầu, `canCheckIn=true`; slot 3: upcoming, `targetLessonId=null`.
   - V2: bucket ngày mai → `canCheckIn=false`, `canCancelEdit=true` (Hủy/Sửa); bucket hôm nay → `canCheckIn=true`; completed/cancelled → target null; row `absent` → badge "Vắng mặt", target null, không nút.
   - Lớp trộn (row cũ undated + row mới có `date`): `findClassOccurrence` với ref có ngày trả occurrence v2 đúng bucket, không bị prefix legacy làm lệch.
   - Legacy slot 3 (không phải head): `canCancelEdit=false`; slot tương lai là head → `canCancelEdit=true`, `canCheckIn=false`.
2. Test `findClassOccurrence` với fixture Lớp Test 1 (schedule `{"days":[1,4],"start":"19:00","end":"20:30"}`, startDate `2026-08-25`, total 26): ref columnDateISO `2026-10-06` → slotIndex 7.
3. Implement helpers; refactor `sessionAttendanceState` dùng helper (nếu không đổi output).
4. Sửa modal + card grid.
5. Chạy `pnpm --filter web test`, `pnpm check`, `pnpm check-types`.
6. E2E `class-operations.spec.ts` hiện check-in buổi đầu của lớp tạo mặc định "bắt đầu ngày mai" (`:38-39`, `:105-112`) → sẽ vỡ. Sửa: seed `startDate = vietnamTodayISO()` (qua `seedDatedClass` như `schedule-session-modal.spec.ts`) cho nhánh check-in thành công, và thêm assertion nút Điểm danh **ẩn** cho buổi tương lai. Thêm e2e/component test cho popup legacy undated (ca bug gốc: 2 HV × nhiều tuần, UUID completed nhỏ hơn upcoming → cả 2 "Sắp tới", không nút Điểm danh).
7. Verify tay trên dev stack (port 8001) với Lớp Test 1 **trước khi chạy backfill phase 3**: popup 06/10, 25/08, 01/09; 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; chụp screenshot cho PR.

## Validation

- Unit tests mới xanh; test cũ `class-sessions*.test.ts`, `schedule-week.test.ts` xanh không sửa expectation (trừ test đặc tả `distinctStudentsBySid` nếu helper bị bỏ — chỉ xoá khi không còn caller).
- `pnpm --filter e2e e2e` spec `schedule-session-modal` + `class-operations` xanh với port override.

## Risks

- `buildClassSessions` legacy trả null khi có row đã bị lesson-edit dời giờ → fallback row-based như hành vi hiện tại (không mất đường điểm danh duy nhất). Giới hạn đã biết: ở nhánh này trạng thái vẫn tuỳ UUID như trước; chỉ chặn future-check-in khi row có `date`.
- Hiệu năng: `buildClassSessions` chạy mỗi card legacy; ≤ 52 row/lớp → không đáng kể. Memo theo `classId` trong `schedule.tsx` nếu cần.
