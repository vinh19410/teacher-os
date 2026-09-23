---
phase: 1
title: "Helper group buổi-lớp + unit tests"
status: todo
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Helper group buổi-lớp + unit tests

## Goal

Thêm pure helper `groupLessonsByClassSession` vào `apps/web/src/lib/dashboard-from-kernel.ts` để gom các dòng `Lesson` per-student thành buổi-lớp theo key `(classId, time)`, kèm describe unit test mới — không đổi bất kỳ hàm/data nào hiện có trong file.

## Files to Create/Modify

- Modify: `apps/web/src/lib/dashboard-from-kernel.ts` — thêm `export interface DashboardClassSession` + `export function groupLessonsByClassSession`
- Modify: `apps/web/src/lib/dashboard-from-kernel.test.ts` — thêm describe `groupLessonsByClassSession`

## Tasks & Steps

1. Trong `apps/web/src/lib/dashboard-from-kernel.ts`, thêm interface và helper (đặt cạnh `lessonsToday`/`upcomingLessonsThisWeek`, giữ nguyên phần còn lại của file):
   ```ts
   export interface DashboardClassSession {
     classId: string;
     time: string;
     dur: number;
     type: Lesson["type"];
     topic: string;
     lessons: Lesson[];
   }

   export function groupLessonsByClassSession(
     lessons: Lesson[],
   ): DashboardClassSession[] {
     // group theo (classId, time); field display lấy từ row đầu;
     // giữ thứ tự group và thứ tự lessons theo input.
   }
   ```
   - Dùng `Map<string, DashboardClassSession>` với key composite `` `${lesson.classId}|${lesson.time}` `` — `Map` giữ insertion order nên thứ tự group = thứ tự row đầu tiên xuất hiện trong input; các row tiếp theo của cùng key được push vào `lessons` theo thứ tự input.
   - Field `time`/`dur`/`type`/`topic` lấy từ row đầu của group (các row cùng buổi-lớp share display data).
   - Không sort, không filter trong helper — input đã được `lessonsToday` (sort time) hoặc từng day-group của `upcomingLessonsThisWeek` (sort day, time) sắp xếp; helper nhận đúng 1 scope ngày đã lọc nên không merge qua ngày.
2. Trong `apps/web/src/lib/dashboard-from-kernel.test.ts`, thêm describe `groupLessonsByClassSession` sau describe `lessonsToday`, dùng fixture builder `lesson()` sẵn có của file (test file dòng 45–59 — mặc định `classId: "cl-1"`, `time: "19:00"`; override qua partial). Viết 5 test:
   - (a) nhiều học viên cùng lớp cùng giờ → đúng 1 group, `lessons` đủ các row theo thứ tự input.
   - (b) cùng lớp khác giờ (`cl-1` 19:00 và 20:00) → 2 group.
   - (c) khác lớp cùng giờ (`cl-1` và `cl-2` cùng 19:00) → 2 group.
   - (d) thứ tự group theo input: đưa 2 buổi ở thứ tự thời gian ngược (input đã sort giả lập) → output theo đúng thứ tự input, không tự sort.
   - (e) field display (`time`, `dur`, `type`, `topic`) lấy từ row đầu của group.
   Không sửa các test hiện có đang pin `lessonsToday` / `upcomingLessonsThisWeek` / `atRiskRows` / `formatDashboardLead`.
3. Chạy lọc nhanh: `pnpm --filter web test -- dashboard-from-kernel` — describe mới và toàn bộ test cũ trong file phải pass.

## Verification

- `pnpm --filter web test`
- `pnpm check-types`
- `pnpm exec biome check apps/web/src/lib`
