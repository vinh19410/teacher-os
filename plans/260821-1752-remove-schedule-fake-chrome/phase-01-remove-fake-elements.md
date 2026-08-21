---
phase: 1
title: "Gỡ phần tử giả + TDD helper label + contract test"
status: completed
priority: P1
effort: "1h30m"
dependencies: []
---

# Phase 1: Gỡ phần tử giả + TDD helper label + contract test

## Overview
Viết test trước (unit test cho helper `lessonDayLabel` + source-contract test khóa schedule không còn fake chrome — theo convention `kernel-runtime.contract.test.ts` của dashboard), sau đó gỡ toàn bộ phần tử UI giả khỏi schedule grid, lesson modal, class detail, và xóa export `dayDates` khỏi mock-data.

## Requirements
- Functional:
  - `lessonDayLabel(day: number): string` trong `format-schedule.ts` — nhận `lesson.day` **1-based** (1..7, verified: `kernel.ts:96` sinh `day = days[...]+1`, contract `min(1).max(7)` tại `contracts.ts:167`), trả về `dayNames[day-1]` ("T2".."CN"); out-of-range → fallback `day \${day}`; KHÔNG chứa ngày tháng giả.
  - **JSDoc bắt buộc** trên helper phân biệt 2 quy ước trong cùng file (mirror comment style `kernel.ts:79-84`): `lessonDayLabel` nhận 1-based (lesson-day convention), còn `parseSchedule().days`/`formatSchedule` dùng 0-based (class schedule JSON) — tránh off-by-one khi #56 wire tuần thật.
  - Contract test mới trong `kernel-runtime.contract.test.ts` (dùng sẵn `readSrc()`): `schedule.tsx` `.not.toMatch` cho `GCal`, `todayIdx`, `dayDates`, `19–25/08`, `11 buổi học`, `← Trước`, `Sau →`, `Tuần này`; `lesson-modal.tsx` + `$classId.tsx` + `mock-data.ts` `.not.toMatch(/dayDates/)`. Pattern mirror test dashboard (dòng 160-180).
  - Schedule route: không còn Badge GCal, chip nav tuần, `todayIdx`/class `today`, số ngày `dayDates`, lead PageHead hardcode.
  - Lesson modal hiển thị `{dayName} · {lesson.time} ({lesson.dur} phút)`; class detail cột "Ngày" hiển thị `{dayName}` (cột "Giờ" đã render `{l.time}` riêng — không nhét time vào cell Ngày).
  - `dayDates` bị xóa khỏi `mock-data.ts`.
- Non-functional:
  - Không thêm component/CTA/stub mới; không đổi data flow `useData`; không đụng `dayNames`, legend loại buổi, typeBlockClass.
  - Giữ nguyên mọi assertion hiện hữu của `kernel-runtime.contract.test.ts` (đặc biệt dòng 195-208 đọc `$classId.tsx` + `lesson-modal.tsx`).

## Architecture
- Helper đặt trong `apps/web/src/lib/format-schedule.ts` (nơi đã import `dayNames`; DRY, đúng convention test logic trong `src/lib`). Hai bề mặt JSX gọi chung 1 helper.
- Contract test là regression guard sống sót sau merge — enforcement thật cho DOD M1 "0 CTA no-op trong luồng classes/schedule" (bảo vệ khỏi #56 hoặc PR tương lai tái reintroduce fake chrome).
- Schedule route chỉ xoá JSX/imports — không thêm abstraction chờ #56 (YAGNI).

## Related Code Files
- Create: (không có file mới)
- Modify: `apps/web/src/lib/format-schedule.ts` (thêm `lessonDayLabel` + JSDoc), `apps/web/src/lib/format-schedule.test.ts` (test case mới), `apps/web/src/lib/kernel-runtime.contract.test.ts` (contract test mới), `apps/web/src/routes/_auth/schedule.tsx`, `apps/web/src/components/schedule/lesson-modal.tsx`, `apps/web/src/routes/_auth/classes/$classId.tsx`
- Delete: dòng `export const dayDates = [...]` trong `apps/web/src/lib/mock-data.ts`

## Implementation Steps (TDD)
1. **RED** — thêm 2 nhóm test:
   a. `format-schedule.test.ts`: `lessonDayLabel(1)` → "T2", `lessonDayLabel(7)` → "CN", `lessonDayLabel(0)`/`lessonDayLabel(8)` → fallback "day 0"/"day 8".
   b. `kernel-runtime.contract.test.ts`: contract test schedule-chrome (chi tiết ở Requirements). Chạy `pnpm -F web test` → fail (helper chưa có; fake strings vẫn còn trong source).
2. **GREEN** — implement `lessonDayLabel` + JSDoc quy ước trong `format-schedule.ts`. Thực hiện các bước gỡ:
   - `schedule.tsx`: xóa `<Badge>GCal · Đã bật</Badge>`; xóa cả row `mb-4 flex ... justify-between` (chips + badge); bỏ prop `lead` của `PageHead`; xóa `todayIdx` + nhánh conditional class `today`/`accent-blue` (đổi về class tĩnh); xóa block `{dayDates[i]}`; sửa import bỏ `dayDates`.
   - `lesson-modal.tsx:38` → `{lessonDayLabel(lesson.day)} · {lesson.time} ({lesson.dur} phút)`; cập nhật import.
   - `$classId.tsx:193` → `lessonDayLabel(l.day)`; cập nhật import.
   - `mock-data.ts`: xóa `export const dayDates`.
3. **Checklist import thủ công** (biome/tsc KHÔNG bắt unused import — red-team finding 4): xóa `import { Badge }` khỏi schedule.tsx; grep-verify rồi dọn dead import `Button`, `Card` có sẵn trong schedule.tsx (0 usage — verified red-team). Chỉ chạy `pnpm check` (biome `--write`) để format/sort class, KHÔNG kỳ vọng nó xóa import.
4. **Verify trong phase**: `pnpm -F web test` xanh (bao gồm contract test mới + toàn bộ test cũ); grep scoped 4 file: `grep -n "dayDates\|todayIdx\|GCal\|19–25\|11 buổi học\|← Trước\|Sau →" apps/web/src/routes/_auth/schedule.tsx apps/web/src/components/schedule/lesson-modal.tsx "apps/web/src/routes/_auth/classes/\$classId.tsx" apps/web/src/lib/mock-data.ts` → 0 kết quả.

## Success Criteria
- [x] Test `lessonDayLabel` pass (case 1..7 + fallback out-of-range).
- [x] Contract test schedule-chrome pass; toàn bộ test hiện hữu vẫn pass.
- [x] Grep scoped 4 file (pattern trên) → 0 kết quả.
- [x] Schedule render: PageHead chỉ còn title; grid chỉ còn dayNames + lessons; không badge/chip.

## Risk Assessment
- Import thừa sau khi gỡ → KHÔNG có gate tự bắt; kiểm bằng checklist bước 3 + review thủ công.
- **Fallback nếu issue owner phản đối việc gồm `$classId.tsx`:** KHÔNG thể "bỏ bước $classId" đơn thuần — `$classId.tsx` còn `import dayDates` nên bỏ bước này thì phải giữ export `dayDates` trong mock-data (điều chỉnh Goal 3 + contract test bỏ assertion mock-data). Hoặc tách commit riêng nhưng vẫn sửa file. Mặc định: giữ $classId trong scope (đã justify bằng DOD M1 "luồng classes/schedule").
