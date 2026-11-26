---
phase: 1
title: "Phase 1: Pure Selectors, Time/Goal Helpers & Schedule Hook Option (TDD)"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Pure Selectors, Time/Goal Helpers & Schedule Hook Option (TDD)

## Goal

Mở rộng tùy chọn `enabled` và `orgIdOverride` cho `useStudentSchedule` để đồng bộ ngữ cảnh org ổn định, và xây dựng hoàn chỉnh tầng logic thuần cho toàn bộ dữ liệu trang `/student/` (Next Task Hero + đếm tách bạch overdue/due-soon, Today Schedule + upcomingFallback an toàn, Goal Progress + thước IELTS trung thực đã clamp, Tuition Summary đã chuẩn hóa) theo quy trình TDD đỏ-xanh, không chạm server/DB.

## Files to Create / Modify

- Modify: `apps/student/src/lib/repos/student.ts` (`UseStudentScheduleOptions`, `useStudentSchedule`)
- Create: `apps/student/src/lib/student-overview-selectors.ts`
- Create: `apps/student/src/lib/student-overview-selectors.test.ts`

## Tests Before

Viết trước file test `apps/student/src/lib/student-overview-selectors.test.ts` trước khi tạo `apps/student/src/lib/student-overview-selectors.ts`.
- Điều kiện đỏ (TDD red phase): chạy `pnpm --filter student exec vitest run src/lib/student-overview-selectors.test.ts` phải thoát khác `0` do thiếu module `student-overview-selectors.ts`; nếu lệnh thoát `0` là sai quy trình TDD.

## Tasks & Steps

### Task 1.1 — Thêm tùy chọn `enabled` và `orgIdOverride` cho `useStudentSchedule`

<!-- Updated: Red Team Session 1 - Thêm orgIdOverride để đồng bộ queryKey với me.student.orgId, triệt tiêu double-fetch null -> orgId khi đăng nhập lần đầu và skew khi đổi org -->

- **Goal:** Cho phép `StudentOverviewContent` truyền `orgIdOverride` (ưu tiên `activeOrgId ?? me.student.orgId`) và `enabled` vào `useStudentSchedule`, tránh double-fetch/nháy skeleton lúc `localStorage` chưa hydrate và chặn fetch lệch org khi chuyển tổ chức.
- **Target files and symbols:** `apps/student/src/lib/repos/student.ts` (`UseStudentScheduleOptions`, `useStudentSchedule`).
- **Steps:**
  1. Đọc `apps/student/src/lib/repos/student.ts` dòng 420–442.
  2. Thêm `enabled?: boolean;` và `orgIdOverride?: string | null;` vào `UseStudentScheduleOptions`.
  3. Trong `useStudentSchedule(options)`: tách `const { orgIdOverride, ...queryOptions } = options ?? {};`, tính `const scopedOrgId = orgIdOverride !== undefined ? orgIdOverride : activeOrgId;`, dùng `queryKey: ["student", "schedule", scopedOrgId]` và spread `...queryOptions` vào `useQuery({ ... })` (bảo toàn 100% hành vi cũ cho caller không truyền `orgIdOverride`).
- **Success criteria:** `UseStudentScheduleOptions` chấp nhận `{ enabled?: boolean; orgIdOverride?: string | null }` và `tsc --noEmit` không lỗi.
- **Verify:** `pnpm --filter student exec tsc --noEmit` exits 0.

### Task 1.2 — Viết bộ unit test TDD đỏ cho toàn bộ selector trang chủ học viên

<!-- Updated: Red Team Session 1 - Bổ sung TDD cho allowlist classes từ schedule.data.classes, upcomingFallback từ lessons đã lọc kết thúc/hủy, dur == null, relativeText, 00:00-00:29 VN, parseIeltsBand "6.5 IELTS"/CEFR/clamp/6 mức level/current >= target, invoiceTypeLabel "tuition"/"   ", và tách overdueCount/dueSoonCount -->

- **Goal:** Định nghĩa rõ toàn bộ hợp đồng đầu vào/đầu ra và mọi edge case thực tế của `student-overview-selectors.ts` trước khi viết code triển khai.
- **Target files and symbols:** `apps/student/src/lib/student-overview-selectors.test.ts`.
- **Steps:**
  1. Tạo file `apps/student/src/lib/student-overview-selectors.test.ts` kiểm chứng đầy đủ 5 nhóm hàm:
     - **Nhóm thời gian (`formatSessionEndTime`, `formatVietnamLongDate`, `vietnamClockHHMM`, `formatMinutesUntilStart`):**
       - `formatSessionEndTime("18:30", 90)` → `"20:00"`; qua nửa đêm `("23:30", 60)` → `"00:30"`.
       - Input bẩn (`"invalid"`, `""`, `dur: 0`, `dur: -30`, `dur: Number.NaN`, `dur: undefined`) → `null` (tuyệt đối không trả `"NaN:NaN"`).
       - `formatVietnamLongDate(Date.parse("2026-11-26T10:52:00Z"))` → `"Thứ Năm, 26 tháng 11"` (giờ VN UTC+7).
       - `vietnamClockHHMM(Date.parse("2026-11-26T10:52:00Z"))` → `"17:52"`, `vietnamClockHHMM(Number.NaN)` → `""`.
       - `formatMinutesUntilStart(15)` → `"15 phút"`, `formatMinutesUntilStart(60)` → `"1 giờ"`, `formatMinutesUntilStart(125)` → `"2 giờ 5 phút"`, `formatMinutesUntilStart(0)` → `"1 phút"`.
     - **Nhóm Next Task Hero (`selectNextTaskHero`, `formatAssignmentSkillLabel`):**
       - Loại bài `source === "grading"` (không có route `/learn/quizzes/$assignmentId`) khỏi `primary`, `queue`, và `totalPending`.
       - Tách riêng `overdueCount` và `dueSoonCount` đếm trên **toàn bộ** `assignments` bằng `deriveAssignmentStatus` (khớp 100% số đếm tab `"Quá hạn"` và `"Sắp đến hạn"` trong `AssignmentList`, kể cả bài `source === "grading"`).
       - Loại bài đã nộp (`submittedAt != null`), đã chốt chấm (`gradedAt != null`), hoặc đã có `scores` hợp lệ (`calculateIeltsBand(scores) != null`) khỏi `primary`/`queue`/`totalPending`.
       - Sắp xếp đúng thứ tự ưu tiên: `overdue` → `due-soon` → `not-submitted`; trong cùng nhóm tie-break theo `dueAtMs` tăng dần (bài có hạn trước bài không hạn, rồi `id` tăng dần).
       - `queue` lấy tối đa 2 bài kế tiếp sau `primary`.
       - Tính nhãn thời gian còn lại trung thực: có `dueAt` thì tính phút/giờ/ngày (`còn 45 phút`, `còn 6 giờ`, `còn 2 ngày`); chỉ có `due` ISO thì `"hôm nay"` / `"còn N ngày"` (không bịa `"23:59"`); quá hạn thì `"Đã quá hạn"` với `tone: "destructive"`; không có hạn thì `remaining: null`.
       - `formatAssignmentSkillLabel("writing")` → `"Writing"`, `null`/rỗng → `null`.
     - **Nhóm Today Schedule (`selectTodaySchedule`):**
       - **Allowlist fail-closed:** chỉ giữ buổi thuộc lớp có trong `classes` với `status === "active" && enrollmentStatus === "active"` (buổi có `classId` lạ không có trong `classes`, hoặc lớp `paused`/`invited` đều bị loại bỏ hoàn toàn), và bỏ buổi `status === "cancelled" | "holiday"`.
       - Phân loại 4 trạng thái bằng đúng `ZOOM_EARLY_JOIN_MINUTES = 30` và nhận diện Zoom qua `Boolean(item.hasZoom ?? item.joinUrl)`:
         - `ended` khi `status === "completed" | "absent"` HOẶC `(endMs != null && nowMs >= endMs)`.
         - `live` khi `startMs != null && nowMs >= startMs && (endMs == null || nowMs < endMs)`.
         - `open` khi `hasZoom === true` và `startMs != null && openMs != null && nowMs >= openMs && nowMs < startMs` (kèm `minutesUntilStart` & `relativeText`).
         - `later` khi `startMs != null && nowMs < startMs` (không phải `open`): cung cấp `relativeText` (cho cả `< 60 phút` lẫn `>= 60 phút`) và `openAtLabel` (khi `vietnamDateKeyOf(openMs) === todayISO` là `"HH:mm"`, khi buổi `00:00–00:29 VN` khiến `openMs` lùi về hôm qua là `"HH:mm dd/mm"`).
       - Tính chính xác `remainingCount` = số buổi hôm nay có `state !== "ended"`.
       - Khi `lessons` là mảng hợp lệ và hôm nay không có buổi (`todayItems.length === 0`): tính `upcomingFallback` trực tiếp từ `lessons` (lọc `status === "upcoming"`, allowlist lớp `active`, `date != null`, chưa kết thúc `endMs == null || endMs > nowMs`, tối đa 2 buổi gần nhất tăng dần theo `date`, `time`).
       - Khi `lessons === null` (nhánh lỗi `/api/student/schedule`): fallback sang `classes[].nextSession` (chỉ lớp `active` + enrollment `active`, `endMs == null || endMs > nowMs`, xử lý an toàn `dur === undefined` để KHÔNG bao giờ so `nowMs >= null` thành `ended`), đặt cờ `isFallback: true`.
       - Xử lý an toàn `time`/`dur` bẩn không gây crash hay `NaN`.
     - **Nhóm Goal Progress (`parseIeltsBand`, `deriveStudentGoalSummary`):**
       - `parseIeltsBand`: chấp nhận `"6.5"`, `"8.0+"` (`isPlus: true`, `value: 8`, KHÔNG `NaN`!), `"Band 5.5"`, `"6.5 IELTS"`, `"7.0 IELTS"`, `"IELTS 6.5"`; từ chối `"800 TOEIC"`, `"B1"`, `"B1 trở lên"`, `"B2"`, `"10.0"`, `""`.
       - Hồ sơ IELTS có `entryScore: "5.5"`, `targetScore: "6.5"` → 4 stat thật (`5.5`, `6.5`, `+1.0`, `activeClassCount`), `ieltsScale` có `currentPoint: 5.5` (pct `30%`) và `targetPoint: 6.5` (pct `50%`).
       - Hồ sơ IELTS có `entryScore: "6.5 IELTS"`, `targetScore: "8.0+"` → `currentPoint: 6.5`, `targetPoint: 8`, gap `"+1.5+"`.
       - Hồ sơ IELTS có `entryScore: "B1 trở lên"` (CEFR từ placement) và `currentLevel: "intermediate"`, `targetScore: "6.5"` → Stat 1 hiển thị `"B1 trở lên"` với sub `"Điểm đầu vào đã ghi nhận"`, KHÔNG vẽ chồng `currentRange` lên thước IELTS (`currentPoint: undefined, currentRange: undefined`).
       - Hồ sơ IELTS `entryScore: "3.5"` (`< 4.0`) → pin được clamp/ẩn an toàn (không `left < 0%` gây tràn ngang), `gap` tính đúng `"+3.0"`.
       - Hồ sơ IELTS `entryScore: "7.0"`, `targetScore: "6.5"` (`current >= target`) → Stat 3 hiển thị `"Đã đạt"`, `gapWidthPct === 0` (tuyệt đối không số âm).
       - Kiểm đủ cả 6 mức `CURRENT_LEVEL_OPTIONS` cho IELTS (`beginner` → không range; `basic` `"Dưới 4.5"` → range `[4.0, 4.5]`; `intermediate` → `[4.5, 5.5]`, gap `"+1.0 – 2.0"`; `upper-intermediate` → `[6.0, 6.5]`; `advanced` `"7.0 trở lên"` → `[7.0, 9.0]`; `unsure` → không range, fallback `Thời gian tự học`).
       - Hồ sơ `communication` (`currentLevel: "intermediate"`, `targetScore: "B2"`, `dailyStudyHours: "2-3"`) → `ieltsScale: null`, `examLabel: "Giao Tiếp"`, stat hiển thị `"B1"`, `"B2"`, `"2–3 giờ"`, `activeClassCount`.
       - Hồ sơ rỗng hoàn toàn (`currentLevel: null, targetScore: null, entryScore: null, dailyStudyHours: undefined`) → `hasGoalData: false`.
     - **Nhóm Tuition Summary (`selectStudentTuitionSummary`, `normalizeInvoiceTypeLabel`):**
       - Mảng rỗng → `null`.
       - `normalizeInvoiceTypeLabel("tuition")` → `"Học phí"`, `normalizeInvoiceTypeLabel("   ")` → `"Học phí"`, `normalizeInvoiceTypeLabel("")` → `"Học phí"`, `normalizeInvoiceTypeLabel("Phí tài liệu")` → `"Phí tài liệu"`.
       - Hóa đơn thu tay (`status: "paid", paidAmount: 0, amountDue: 5_000_000`) được tính là đã thanh toán (`totalDue: 0, totalPaid: 5_000_000, unsettledCount: 0`), khớp `TuitionList`.
       - Hóa đơn hỗn hợp (1 settled + 2 chưa đóng `500k` và `400k`) → `primaryInvoice` là hóa đơn chưa đóng đầu tiên (`500k`), `totalDue: 900_000`, `unsettledCount: 2`, `primaryInvoiceDue: 500_000`, `totalInvoices: 3`, `primaryLinkAriaLabel` luôn chứa chuỗi `"Học phí"` (kể cả khi `type === "Phí tài liệu"` hoặc `"tuition"`).
- **Success criteria:** File test đầy đủ các case trên và chạy đỏ vì module đích chưa tồn tại.
- **Verify:** `pnpm --filter student exec vitest run src/lib/student-overview-selectors.test.ts` exits non-zero (expected TDD red state; exit 0 is a failure).

### Task 1.3 — Triển khai `apps/student/src/lib/student-overview-selectors.ts` đạt xanh TDD

<!-- Updated: Red Team Session 1 - Bổ sung import EXAM_LABELS và đầy đủ fields hợp đồng với Phase 2 -->

- **Goal:** Cài đặt toàn bộ hàm thuần đã định nghĩa ở Task 1.2 dùng lại các tiện ích sẵn có từ `@teacher-os/api/vietnam-date`, `@teacher-os/api/zoom-window`, `@/lib/assignment-status`, và `@/components/onboarding/onboarding-steps`.
- **Target files and symbols:** `apps/student/src/lib/student-overview-selectors.ts` (`formatSessionEndTime`, `formatVietnamLongDate`, `vietnamClockHHMM`, `formatMinutesUntilStart`, `formatAssignmentSkillLabel`, `selectNextTaskHero`, `selectTodaySchedule`, `parseIeltsBand`, `deriveStudentGoalSummary`, `normalizeInvoiceTypeLabel`, `selectStudentTuitionSummary`).
- **Steps:**
  1. Tạo `apps/student/src/lib/student-overview-selectors.ts` tái dùng:
     - `evaluateAssignmentDeadline`, `formatVietnamTimeHHMM`, `vietnamDateKeyOf`, `vietnamDateTimeMs`, `vietnamSessionEndMs`, `vietnamTodayISO` từ `@teacher-os/api/vietnam-date`.
     - `evaluateZoomJoinWindow`, `ZOOM_EARLY_JOIN_MINUTES` từ `@teacher-os/api/zoom-window`.
     - `calculateIeltsBand`, `deriveAssignmentStatus` từ `@/lib/assignment-status`.
     - `EXAM_LABELS`, `EXAM_SCALE_LABELS`, `getCurrentLevelLabel`, `HOUR_LABELS`, `toStoredExamInterest` từ `@/components/onboarding/onboarding-steps`.
     - `VI_DAY_NAMES` từ `@/lib/vietnam-display-date`.
  2. Export đầy đủ các interface kiểu trả về (`NextTaskHeroData`, `NextTaskItem`, `TodayScheduleData`, `TodayScheduleItem`, `TodaySessionState`, `UpcomingFallbackItem`, `StudentGoalSummary`, `GoalStatItem`, `IeltsBandScale`, `StudentTuitionSummary`) khớp 100% với Phase 2.
  3. Chạy Vitest, TypeScript check và Biome check.
- **Success criteria:** Toàn bộ test trong `student-overview-selectors.test.ts` pass và `tsc --noEmit` + `biome check` sạch.
- **Verify:** `pnpm --filter student exec vitest run src/lib/student-overview-selectors.test.ts && pnpm --filter student exec tsc --noEmit && pnpm exec biome check apps/student/src/lib/student-overview-selectors.ts apps/student/src/lib/student-overview-selectors.test.ts apps/student/src/lib/repos/student.ts` exits 0.

## Tests After

- `pnpm --filter student exec vitest run src/lib/student-overview-selectors.test.ts` exits 0.
- `pnpm --filter student exec tsc --noEmit` exits 0.

## Verification

- `pnpm --filter student exec vitest run src/lib/student-overview-selectors.test.ts` passes all cases.
- `pnpm exec biome check apps/student/src/lib/student-overview-selectors.ts apps/student/src/lib/student-overview-selectors.test.ts apps/student/src/lib/repos/student.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
