---
phase: 2
title: "planHolidayShift — module thuần tính buổi trùng và ngày bù"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-01"]
---

# Phase 2: Module thuần `planHolidayShift`

## Goal

Một hàm thuần, không import db/server/web (cùng quy ước `skeleton.ts`), nhận dữ liệu đã đọc sẵn và trả kế hoạch dời buổi. Preview và apply cùng gọi hàm này (D7).

## Files to Create / Modify

- Create: `packages/api/src/holiday-plan.ts`
- Create: `packages/api/src/holiday-plan.test.ts`
- `packages/api/package.json` đã export `./*` nên import được `@teacher-os/api/holiday-plan`, không cần sửa.

## Thiết kế

```ts
interface PlanInput {
  range: { fromDate: string; toDate: string };
  classes: Array<{
    id: string; name: string; schedule: string; // raw JSON
    // mọi lesson của lớp, chỉ cần các trường này
    lessons: Array<{ date: string | null; status: string; enrollmentId: string }>;
  }>;
  // kỳ nghỉ đã có hiệu lực với từng lớp (đã lọc theo scope ở server)
  existingHolidayDates: Map<string /*classId*/, Set<string /*yyyy-mm-dd*/>>;
}

interface PlannedShift {
  classId: string; className: string;
  originalDate: string; sessionOrdinal: number; // buổi thứ mấy theo thứ tự date
  makeupDate: string; time: string; dur: number; weekday: number;
  enrollmentIds: string[];          // dòng upcoming ở buổi gốc
  skippedHolidayDates: string[];    // ngày bị nhảy qua (TOS-12 dùng hiển thị "(*)")
}
interface PlanResult {
  shifts: PlannedShift[];
  keptCompleted: Array<{ classId: string; className: string; date: string; sessionOrdinal: number }>;
  unsupported: Array<{ classId: string; className: string; reason: "legacy-schedule" | "undated" }>;
}
```

Quy tắc:

1. Gom lesson theo `date` thành buổi; bỏ buổi mà mọi dòng là `cancelled` hoặc `holiday`.
2. Buổi trong `[fromDate, toDate]`:
   - Mọi dòng còn lại đều `upcoming` → đưa vào `shifts`.
   - Có dòng `completed`/`absent` (đã điểm danh) → `keptCompleted`, không đụng (D1).
3. Lớp có `parseStoredSchedule` null → `unsupported: legacy-schedule`; lớp có bất kỳ `date = null` → `unsupported: undated`.
4. Ngày bù (D4, thống nhất với plan.md sau red-team I1): con trỏ bắt đầu từ `max(max(date)` của **mọi nhóm buổi không `cancelled`/`holiday`, kể cả các buổi sắp bị dời**, `vietnamToday`) `+ 1`. Định nghĩa "đã có buổi": ngày đó có **bất kỳ dòng lesson nào** (`enrollmentId` bất kỳ, mọi trạng thái — cùng quan sát `bucketCounts` `kernel.ts:689`); ngày có dòng `cancelled`/`holiday` vẫn tính là đã có buổi, không trộn chung ngày. Ngày bị loại vì kỳ nghỉ → ghi vào `skippedHolidayDates`. Giới hạn vòng lặp `shifts * 7 * 52` ngày, vượt thì ném lỗi (không bịa ngày).
5. `time = schedule.start`, `dur` cùng công thức `generateScheduleLessons` — tách helper `scheduleDurationMinutes` vào `skeleton.ts` và cho `enrollment-activation.ts` dùng lại (DRY).
6. Thứ tự output ổn định: theo `className`, rồi `originalDate`.

## Tasks & Steps

1. Test đỏ (dùng ngày UTC cố định):
   - Lớp T6, 24 buổi, ngày nghỉ 20/11 rơi vào buổi 14 → 1 shift, `makeupDate` = Thứ Sáu kế tiếp sau buổi cuối.
   - Lớp T3 & T7, nghỉ 2 ngày trúng 2 buổi → 2 buổi bù nối tiếp đúng thứ (T3 rồi T7).
   - Ngày bù dự kiến 26/12 thuộc kỳ nghỉ khác → nhảy sang 29/12, `skippedHolidayDates = ["2026-12-26"]` (đúng ví dụ AC-002).
   - Buổi có 1 dòng `completed` → vào `keptCompleted`, không có shift.
   - Buổi toàn `cancelled` trong khoảng → bỏ qua.
   - Con trỏ bắt đầu: buổi bị dời là buổi cuối + một ngày đúng-thứ trống phía trước (do `moveDate` cũ) → ngày bù vẫn **sau** buổi cuối, không rơi vào ngày trống đó (I1).
   - `max(date)` nhỏ hơn hôm nay → con trỏ bắt đầu từ `vietnamToday + 1`, không sinh ngày bù trong quá khứ (I1/I2).
   - Lớp schedule legacy → `unsupported`.
   - Khoảng không trúng buổi nào → `shifts` rỗng.
   - Gọi 2 lần cùng input → output giống hệt (deterministic).
2. Viết hàm cho test xanh; refactor helper duration.

## Verification

- `pnpm --filter @teacher-os/api test -- holiday-plan`
- `pnpm --filter server test -- lesson-date-integration` (sau khi tách helper duration)
- `pnpm check-types`
