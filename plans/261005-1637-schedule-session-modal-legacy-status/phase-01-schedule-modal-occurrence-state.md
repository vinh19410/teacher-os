---
phase: 1
title: "Popup /schedule đọc trạng thái theo đúng buổi + chặn điểm danh tương lai (UI)"
status: pending
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
     /** Row để Điểm danh/Hủy/Sửa; null = không có thao tác hợp lệ. */
     targetLessonId: string | null;
     /** true khi được phép điểm danh (target != null && dateISO <= today). */
     canCheckIn: boolean;
   }
   export function occurrenceSidStates(session: ClassSession, todayISO: string): OccurrenceSidState[]
   ```
   - v2: row của HV trong bucket là sự thật (giữ logic `sessionAttendanceState` v2 branch, `absent` → upcoming); `targetLessonId` = row id khi `upcoming`.
   - legacy: `status = sidStateAt(stats, slotIndex)`; `targetLessonId` = `firstUpcomingLessonId` **chỉ khi** `isSequentialHead`; ngược lại null.
   - `canCheckIn = targetLessonId !== null && sessionIsEligibleDate(session, todayISO)`.
   - Tái dùng `sessionStudents(session)` cho thứ tự HV. Cân nhắc refactor `sessionAttendanceState` gọi helper mới để không lặp logic (DRY) — giữ nguyên output hiện tại (test class-sessions phải xanh không sửa).
2. Thêm helper tìm buổi trong `schedule-week.ts` (hoặc `class-sessions.ts`):
   ```ts
   export function findClassOccurrence(cls: ClassGroup, lessons: Lesson[], ref: SessionRef & { columnDateISO?: string }): ClassSession | null
   ```
   - Lọc `lessons` theo `classId`, gọi `buildClassSessions({ schedule, startDate, lessons, sessionsTotal })`, trả session có `dateISO === (ref.dateISO ?? ref.columnDateISO)` và `time === ref.time`.
   - Trả null khi `buildClassSessions` null (lịch không parse được / divergent) hoặc không khớp.
3. `ClassSessionModal`:
   - Lấy `occurrence = findClassOccurrence(...)`. Có occurrence → render danh sách HV từ `occurrenceSidStates(occurrence, todayISOVietnam())`.
   - Badge: completed → "Hoàn thành", cancelled → "Đã hủy", upcoming → "Sắp tới". Row có `status === "absent"` trên v2 hiển thị "Vắng mặt" như hiện tại (đọc từ row target nếu có).
   - Nút **Sửa / Hủy** chỉ khi `targetLessonId != null`; nút **Điểm danh** chỉ khi `canCheckIn`. Mọi action gửi `targetLessonId` (không còn `row.id` tuỳ ý).
   - Không có occurrence (legacy divergent) → fallback: liệt kê HV distinct, badge "Không xác định buổi" (variant muted), **không** có nút thao tác, kèm dòng gợi ý "Thao tác điểm danh tại tab Buổi học của lớp."
   - Giữ nguyên hành vi edit form, focus restore, `role="group"` + `aria-label` (e2e dựa vào).
4. Card grid `schedule.tsx`: với entry legacy (`dateISO === null`), trạng thái card = `sessionStatus(occurrence)` của buổi trong cột ngày đang xem; entry v2 giữ `rollupSessionStatus`. Truyền `columnDateISO` như modal.
5. "Hôm nay" dùng `todayISOVietnam` từ `@/lib/week-grid` — cùng helper `schedule.tsx` và `session-attendance-modal.tsx` đang dùng.

## Files

- Modify: `apps/web/src/lib/class-sessions.ts`, `apps/web/src/lib/schedule-week.ts`, `apps/web/src/components/schedule/class-session-modal.tsx`, `apps/web/src/routes/_auth/schedule.tsx`
- Tests: `apps/web/src/lib/class-sessions.test.ts`, `apps/web/src/lib/class-sessions.v2.test.ts`, `apps/web/src/lib/schedule-week.test.ts`
- E2E (nếu cần): `apps/e2e/specs/schedule-session-modal.spec.ts`

## Steps

1. Viết test trước cho `occurrenceSidStates`:
   - Legacy 2 sid × 13 buổi Thứ Ba, mỗi sid 1 completed (UUID completed của sid B nhỏ hơn upcoming) → slot 1: cả 2 completed; slot 7 (tương lai): cả 2 upcoming, `canCheckIn=false`; slot 2 với today ≥ slot 2: cả 2 upcoming, `targetLessonId` = row upcoming id-asc đầu, `canCheckIn=true`; slot 3: upcoming, `targetLessonId=null`.
   - V2: bucket ngày mai → `canCheckIn=false`, target vẫn có (Hủy/Sửa); bucket hôm nay → `canCheckIn=true`; completed/cancelled → target null.
2. Test `findClassOccurrence` với fixture Lớp Test 1 (schedule `{"days":[1,4],"start":"19:00","end":"20:30"}`, startDate `2026-08-25`, total 26): ref columnDateISO `2026-10-06` → slotIndex 7.
3. Implement helpers; refactor `sessionAttendanceState` dùng helper (nếu không đổi output).
4. Sửa modal + card grid.
5. Chạy `pnpm --filter web test`, `pnpm check`, `pnpm check-types`.
6. Verify tay trên dev stack (port 8001) với Lớp Test 1 **trước khi chạy backfill phase 3**: popup 06/10, 25/08, 01/09; 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; chụp screenshot cho PR.

## Validation

- Unit tests mới xanh; test cũ `class-sessions*.test.ts`, `schedule-week.test.ts` xanh không sửa expectation (trừ test đặc tả `distinctStudentsBySid` nếu helper bị bỏ — chỉ xoá khi không còn caller).
- `pnpm --filter e2e e2e` spec `schedule-session-modal` + `class-operations` xanh với port override.

## Risks

- `buildClassSessions` legacy trả null khi có row đã bị lesson-edit dời giờ → fallback không thao tác. Chấp nhận: đúng ngữ nghĩa "không xác định được buổi", tab chi tiết lớp cũng fallback.
- Hiệu năng: `buildClassSessions` chạy mỗi card legacy; ≤ 52 row/lớp → không đáng kể. Memo theo `classId` trong `schedule.tsx` nếu cần.
