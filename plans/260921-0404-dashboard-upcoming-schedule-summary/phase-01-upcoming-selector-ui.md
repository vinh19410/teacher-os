---
phase: 1
title: "Selector + UI tóm tắt lịch sắp tới"
status: todo
priority: P2
effort: 2h
dependencies: []
---

# Phase 1: Selector + UI tóm tắt lịch sắp tới

## Overview

Thêm selector thuần `upcomingLessonsThisWeek` vào `dashboard-from-kernel.ts` (chọn phần còn lại của tuần hiện tại, date-aware, loại cancelled, sort day+time), kèm unit tests boundary; rồi render section display-only "Lịch sắp tới" trên `/dashboard` giữa khối "Lịch hôm nay" và "Học viên rủi ro". Không mutation, không API/server/DB mới.

## Requirements

- [ ] Selector `upcomingLessonsThisWeek(lessons, now)` trong `dashboard-from-kernel.ts`:
  - Dòng legacy (`date == null`): giữ khi `lesson.day > lessonDayFromDate(now)` (mai → Chủ nhật).
  - Dòng có `date`: giữ khi `date` thuộc các ngày còn lại của tuần hiện tại — tập hợp từ `weekDates(startOfWeekMonday(todayISOVietnam(now)))` lọc `> todayISOVietnam(now)`; dòng `date` đã qua, là hôm nay, hoặc thuộc tuần khác bị loại.
  - Loại `status === "cancelled"`.
  - Sort theo (`day` asc, `time` asc); trả flat `Lesson[]`.
  - JSDoc ghi rõ khác biệt có chủ ý so với `lessonsToday` (day-based, không xét `date`).
- [ ] UI trong `dashboard.tsx`:
  - Section "Lịch sắp tới" (dùng `SectionLabel`) đặt sau khối "Lịch hôm nay", trước "Học viên rủi ro".
  - Group theo ngày: nhãn ngày từ `lessonDayLabel(day)` (giá trị "T2"…"CN"), row compact: `Avatar` (size sm) + tên học viên + `{time} · {dur}' · {type} · {topic}` (style `font-mono text-meta text-xs` như khối hôm nay).
  - Display-only: không nút Điểm danh, không Button, không Link mới, không thêm link "Xem tuần" thứ hai.
  - Empty state: "Không có buổi học nào trong phần còn lại của tuần." (style `font-mono text-meta text-xs`).
  - Row có `studentById(l.sid)` trả `undefined` thì skip (giống khối hôm nay `return null`).
- [ ] Tests trong `dashboard-from-kernel.test.ts` cover: loại hôm nay + ngày đã qua; loại cancelled; dòng có `date` ngoài/trong tuần còn lại; dòng legacy `day > today` được giữ; boundary Chủ nhật trả rỗng; sort day+time.
- [ ] Gate pass: `pnpm --filter web test` và `pnpm check && pnpm check-types && pnpm test` từ repo root.

## Key Insights

- **Ba quy ước ngày không được trộn** (`apps/web/src/lib/week-grid.ts:4-10`): JSON schedule `days` 0-6; `lesson.day` 1-7 (Mon=1, không bao giờ là calendar date); JS `getDay()` 0=Sunday. Toàn bộ math ngày chạy trên chuỗi `yyyy-mm-dd` UTC-anchored.
- **"Hôm nay" phải resolve theo giờ Việt Nam** (`todayISOVietnam`, `apps/web/src/lib/week-grid.ts:29-34`) — đồng hồ UTC trễ 7h so với VN; `formatDashboardGreeting` đã pin `Asia/Ho_Chi_Minh` cho cùng lý do (`apps/web/src/lib/dashboard-from-kernel.ts:82-100`).
- **`lessonDayFromDate` dùng `getDay()` local** (`apps/web/src/lib/dashboard-from-kernel.ts:7-10`) — nhất quán với `lessonsToday` hiện có; đường legacy và đường dated của selector dùng hai mốc "hôm nay" khác nhau (weekday local vs ISO Việt Nam) là chủ đích, mirror đúng hai ngữ nghĩa dữ liệu.
- **Không circular import**: `week-grid.ts` không import gì từ `dashboard-from-kernel.ts`, nên import ngược an toàn.
- **Fixture test tháng 8/2026** (`apps/web/src/lib/dashboard-from-kernel.test.ts:11-13`): monday=2026-08-17, wednesday=2026-08-19, sunday=2026-08-23, giờ 12:00 local — an toàn cho CI UTC (lệch ±7h không đổi ngày). Tuần của wednesday: 08-17 → 08-23; phần còn lại sau wednesday: 08-20 (T5, day 4), 08-21 (T6, day 5), 08-22 (T7, day 6), 08-23 (CN, day 7).
- **`lessonDayLabel` trả nhãn rút gọn** "T2"…"CN" từ `dayNames` (`apps/web/src/lib/format-schedule.ts:53-55`, `apps/web/src/lib/mock-data.ts:210`) — dùng nguyên giá trị này, không tự format "Thứ N".
- **Kernel generate `day = scheduleDay + 1` từ `date`** nên dòng dated luôn có `day` khớp weekday của `date`; sort theo `day` ổn định cho cả hai loại dòng.

## Architecture / Design

Selector thuần side-effect-free, cùng layer với `lessonsToday`:

```ts
// apps/web/src/lib/dashboard-from-kernel.ts (thêm, đặt ngay sau lessonsToday)
import { startOfWeekMonday, todayISOVietnam, weekDates } from "@/lib/week-grid";

/**
 * Còn lại của tuần hiện tại (mai → Chủ nhật), khác lessonsToday có chủ ý:
 * - legacy (date == null): day > weekday hôm nay (template weekly);
 * - có date: chỉ tính khi date ∈ các ngày còn lại của tuần chứa "hôm nay"
 *   (Việt Nam) — date đã qua/hôm nay/tuần khác bị loại;
 * - loại cancelled; sort (day asc, time asc); flat Lesson[].
 * lessonsToday giữ semantics day-based (không xét date) — không đổi.
 */
export function upcomingLessonsThisWeek(
  lessons: Lesson[],
  now = new Date(),
): Lesson[] {
  const todayDay = lessonDayFromDate(now);
  const todayIso = todayISOVietnam(now);
  const remaining = new Set(
    weekDates(startOfWeekMonday(todayIso)).filter((iso) => iso > todayIso),
  );
  return lessons
    .filter((lesson) => {
      if (lesson.status === "cancelled") return false;
      if (lesson.date == null) return lesson.day > todayDay;
      return remaining.has(lesson.date);
    })
    .slice()
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}
```

Contract UI (trong `dashboard.tsx`):

- `const upcoming = upcomingLessonsThisWeek(data.lessons, now);`
- `const upcomingGroups: Array<{ day: number; lessons: typeof upcoming }> = []` — build bằng vòng for-of: selector đã sort theo day nên các phần tử cùng ngày kề nhau; gặp `day` mới thì push group mới, ngược lại push vào group cuối.
- Render (sau `</div>` đóng khối hôm nay tại `dashboard.tsx:105`, trước `<div className="mt-8">` của "Học viên rủi ro" tại `dashboard.tsx:106`):

```tsx
<div className="mt-8">
  <SectionLabel>Lịch sắp tới</SectionLabel>
  {upcoming.length === 0 ? (
    <p className="font-mono text-meta text-xs">
      Không có buổi học nào trong phần còn lại của tuần.
    </p>
  ) : (
    upcomingGroups.map((group) => (
      <div key={group.day}>
        <div className="mt-4 mb-2 font-semibold text-sm">
          {lessonDayLabel(group.day)}
        </div>
        <div className="flex flex-col gap-2">
          {group.lessons.map((l) => {
            const s = studentById(l.sid);
            if (!s) return null;
            return (
              <Card key={l.id} variant="white" className="flex items-center gap-4">
                <Avatar text={s.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="font-mono text-meta text-xs">
                    {l.time} · {l.dur}' · {l.type} · {l.topic}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    ))
  )}
</div>
```

Không dùng `useMemo` — dashboard hiện compute trực tiếp trong render (`dashboard.tsx:42-44`), giữ nhất quán (KISS).

## Related Code Files

| File | Action | Mô tả |
| --- | --- | --- |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/dashboard-from-kernel.ts` | Modify | Thêm import từ `@/lib/week-grid` và export `upcomingLessonsThisWeek` ngay sau `lessonsToday` (sau dòng 18) |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/lib/dashboard-from-kernel.test.ts` | Modify | Thêm `upcomingLessonsThisWeek` vào import (dòng 2-8); thêm describe block mới |
| `/Users/vinhtran/Documents/project/personal/teacher-os/apps/web/src/routes/_auth/dashboard.tsx` | Modify | Thêm imports (`upcomingLessonsThisWeek`, `lessonDayLabel`); compute upcoming + groups; render section mới giữa dòng 105 và 106 |

Không tạo file mới. Không sửa: `week-grid.ts`, `format-schedule.ts`, `mock-data.ts`, `schedule-week.ts`, server/API/DB.

## Implementation Steps

1. **`apps/web/src/lib/dashboard-from-kernel.ts`** — thêm import `{ startOfWeekMonday, todayISOVietnam, weekDates } from "@/lib/week-grid"`; thêm hàm `upcomingLessonsThisWeek` đúng chữ ký và contract ở phần Architecture, đặt ngay sau `lessonsToday` (dòng 18), kèm JSDoc nêu khác biệt có chủ ý so với `lessonsToday`.
2. **`apps/web/src/lib/dashboard-from-kernel.test.ts`** — thêm `upcomingLessonsThisWeek` vào import; thêm `describe("upcomingLessonsThisWeek", ...)` dùng factory `lesson()` có sẵn (dated row cần set cả `date` và `day` khớp weekday của date, ví dụ `date: "2026-08-20", day: 4`). Các test với fixture `wednesday` (2026-08-19):
   - Legacy: giữ `day: 4` và `day: 5`; loại `day: 3` (hôm nay), `day: 2` (đã qua), `day: 1` (đầu tuần).
   - Loại `day: 4` có `status: "cancelled"`.
   - Dated giữ: `date: "2026-08-20"`, `date: "2026-08-23"`; dated loại: `date: "2026-08-18"` (tuần này đã qua), `date: "2026-08-19"` (hôm nay), `date: "2026-08-25"` (tuần sau).
   - Boundary: với fixture `sunday` (2026-08-23), legacy `day: 7` và dated `2026-08-23` đều bị loại → kết quả `[]`.
   - Sort: trộn legacy (`day: 5, time: "20:00"`), dated (`day: 4, time: "19:00"`), legacy (`day: 4, time: "09:00"`) → thứ tự id tương ứng `[09:00/day4, 19:00/day4, 20:00/day5]`.
   - Boundary `monday` (2026-08-17): legacy `day: 2..7` đều được giữ (toàn tuần còn lại).
3. **`apps/web/src/routes/_auth/dashboard.tsx`** — thêm `upcomingLessonsThisWeek` vào import từ `@/lib/dashboard-from-kernel` (dòng 14-20) và `lessonDayLabel` từ `@/lib/format-schedule`; sau `const today = ...` (dòng 43) compute `upcoming` và `upcomingGroups`; render section theo JSX ở phần Architecture, chèn sau dòng 105 (đóng khối hôm nay) và trước dòng 106 (`<div className="mt-8">` rủi ro).
4. **Verify** — chạy `pnpm --filter web test` từ repo root; khi pass, chạy gate `pnpm check && pnpm check-types && pnpm test`.

## Todo

- [ ] Thêm selector `upcomingLessonsThisWeek` + import week-grid vào `dashboard-from-kernel.ts`.
- [ ] Thêm describe `upcomingLessonsThisWeek` với đầy đủ test boundary ở `dashboard-from-kernel.test.ts`.
- [ ] Thêm section UI "Lịch sắp tới" display-only vào `dashboard.tsx`.
- [ ] Chạy `pnpm --filter web test` pass.
- [ ] Chạy gate `pnpm check && pnpm check-types && pnpm test` pass.

## Success Criteria

- [ ] `upcomingLessonsThisWeek` trả đúng phần còn lại tuần hiện tại theo 3 nhánh (legacy/dated/cancelled) — chứng minh bằng `pnpm --filter web test -- dashboard-from-kernel` exit 0 với các test mới.
- [ ] Boundary Chủ nhật trả `[]` (test).
- [ ] `/dashboard` render "Lịch sắp tới" giữa "Lịch hôm nay" và "Học viên rủi ro"; row không có nút/action; empty state tiếng Việt khi rỗng.
- [ ] `lessonsToday`, `atRiskRows`, `/schedule` không đổi — `git diff` chỉ thấy 3 file trong File Ownership.
- [ ] `pnpm --filter web test` exit 0.
- [ ] `pnpm check && pnpm check-types && pnpm test` exit 0 từ repo root.

## Risk Assessment

| Risk | Likelihood x Impact | Mitigation |
| --- | --- | --- |
| Lọc cửa sổ sai do trộn quy ước ngày (0-6 vs 1-7 vs getDay) | Medium x High | Tái dùng nguyên vẹn `lessonDayFromDate`, `todayISOVietnam`, `startOfWeekMonday`, `weekDates`; không viết date math mới; test dated boundary 4 trường hợp |
| Fixture lệch múi giờ trên CI UTC làm `todayIso`/weekday sai | Low x High | Fixture giờ 12:00 local (±7h không đổi ngày); `todayISOVietnam` pin `Asia/Ho_Chi_Minh`; week math UTC-anchored theo `week-grid.ts` |
| Section render sai thứ tự ngày hoặc group lặp label ngày | Low x Medium | Selector sort (day, time); group tuần tự khi duyệt — gặp `day` mới mở group mới; test sort khóa thứ tự |
| Nhầm thêm action check-in vào row tương lai | Low x Medium | JSX template của phase không có `Button`/`useDirectKernelAction`; review diff trong bước 3 |
| Dòng dated có `day` lệch weekday của `date` (data invariant lệch) làm sort hiển thị sai vị trí | Low x Low | Kernel generate `day` từ `date`; chấp nhận invariant, không xử lý (non-goal) |

## Security Considerations

Không có surface bảo mật mới. Route đã nằm trong `_auth` với redirect login khi thiếu session (`apps/web/src/routes/_auth/dashboard.tsx:24,37-39`); selector chỉ đọc `data.lessons` từ store đã xác thực, không input người dùng, không mutation, không network call mới.

## Next Steps

- Handoff phase này cho executor (`/ak:cook`) — 1 phase duy nhất, không phase 2.
- Sau khi xong: tick toàn bộ Todo/Success Criteria, ghi evidence kết quả lệnh verify, cập nhật `status` plan sang `completed`.
