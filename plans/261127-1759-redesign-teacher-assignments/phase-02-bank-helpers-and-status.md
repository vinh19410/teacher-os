---
phase: 2
title: "Status Đã giao N lớp, URL/Filter/Sort & Duplicate Helpers"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Status `"Đã giao N lớp"`, URL/Filter/Sort & Duplicate Helpers

## Goal

Cập nhật nhãn trạng thái đề ngân hàng sang `"Đã giao {N} lớp"` và xây dựng module helper thuần có unit test đầy đủ cho chuẩn hóa tìm kiếm tiếng Việt không dấu, đồng bộ URL 5 tham số, thống kê KPI, lọc/sắp xếp, xem lịch sử giao thật và tạo payload nhân bản hợp lệ cho cả 6 kỹ năng.

## Files to Create / Modify

- Modify: `apps/web/src/components/assignments/assignment-status.ts`
- Modify: `apps/web/src/components/assignments/assignment-status.test.ts`
- Create: `apps/web/src/components/assignments/assignment-bank-helpers.ts`
- Create: `apps/web/src/components/assignments/assignment-bank-helpers.test.ts`

## Tasks & Steps

### Task 2.1 — Đổi `promptStatus` sang `"Đã giao {N} lớp"` và thêm `fmtDayMonth`
- **Goal:** Đồng bộ nhãn trạng thái ngân hàng với `assignments.html` và bổ sung định dạng `dd/mm` theo múi giờ Việt Nam.
- **Target files and symbols:**
  - `apps/web/src/components/assignments/assignment-status.ts` (`promptStatus`, `fmtDayMonth`)
  - `apps/web/src/components/assignments/assignment-status.test.ts`
- **Steps:**
  1. Cập nhật `promptStatus` trong `assignment-status.ts`: khi `used > 0` trả `{ label: \`Đã giao ${used} lớp\`, tone: "used" }` (`draft` vẫn ưu tiên cao nhất).
  2. Export `fmtDayMonth(iso: string): string` gọi `fmtDate(iso).slice(0, 5)` (hoặc formatter `Asia/Ho_Chi_Minh` trả `dd/mm`, rỗng nếu không hợp lệ).
  3. Cập nhật test trong `assignment-status.test.ts` kiểm `"Đã giao 1 lớp"`, `"Đã giao 3 lớp"` và `fmtDayMonth`.
- **Success criteria:** Test `assignment-status.test.ts` pass xanh.
- **Verify:** `pnpm --filter web exec vitest run src/components/assignments/assignment-status.test.ts` exits 0.

### Task 2.2 — Viết test TDD đỏ cho `assignment-bank-helpers.ts`
- **Goal:** Khóa chặt hợp đồng URL allowlist, tìm kiếm không dấu, 5 chế độ sort (kể cả band rỗng/NaN), thống kê KPI, rollup lịch sử giao và `buildDuplicatePromptPayload` trước khi viết code.
- **Target files and symbols:** `apps/web/src/components/assignments/assignment-bank-helpers.test.ts`.
- **Steps:**
  1. Tạo `assignment-bank-helpers.test.ts` test các hàm dự kiến export từ `assignment-bank-helpers.ts`:
     - `normalizeViSearch` + `promptMatchesQuery`: khớp không dấu (`"Moi truong"`, `"đọc"`, `"Từ vựng"`), strip Bidi/control chars.
     - `validateAssignmentsSearch` + `resolveAssignmentFilters` + `filtersToSearch`: bỏ giá trị mặc định khỏi URL, fallback giá trị lạ về mặc định, tự suy `skill` khi URL cũ chỉ có `?part=task1`.
     - `computeBankStats` + `computeFilterCounts`: đếm đúng `all`, `used`, `ready`, `draft` (`draft` dù có `classAssignment` vẫn tính vào `draft`).
     - `filterAndSortPrompts`: `new`, `used`, `bandDesc`, `bandAsc`, `az`; prompt thiếu/NaN band luôn nằm cuối ở `bandDesc`/`bandAsc` và `fmtBandDisplay` trả `"—"`.
     - `buildHistoryItemView`: tính mẫu số từ `targets.length`, đếm `submittedAt !== null || attemptId != null`, xác định `open`/`closed`/`late` (`Quá hạn · thiếu N`).
     - `buildDuplicatePromptPayload`: test đủ 6 kỹ năng (`writing`, `reading`, `listening`, `speaking`, `grammar`, `vocabulary`), cắt title 200 ký tự về `190 + " (bản sao)"`, chuẩn hóa legacy `part: "tenses"` → `g1`, bảo toàn `level`, xóa `audioUrl` lạ ngoài allowlist, strip `questions`/`optionBank`/`writing` ở non-auto, giữ hybrid `writing` hợp lệ ở auto, trả `ok: false` khi prompt nguồn bị hỏng nội dung lõi (vd reading thiếu passage).
- **Success criteria:** Test fail vì `assignment-bank-helpers.ts` chưa tồn tại.
- **Verify:** `pnpm --filter web exec vitest run src/components/assignments/assignment-bank-helpers.test.ts` exits non-zero.

### Task 2.3 — Triển khai `assignment-bank-helpers.ts`
- **Goal:** Hiện thực đầy đủ toàn bộ logic thuần của `/teacher/assignments` và pass 100% test Task 2.2.
- **Target files and symbols:** `apps/web/src/components/assignments/assignment-bank-helpers.ts`.
- **Steps:**
  1. Cài đặt `normalizeViSearch`, `stripUnsafeSearchChars`, `validateAssignmentsSearch`, `resolveAssignmentFilters`, `filtersToSearch`.
  2. Cài đặt `promptSkillPartType`, `promptEffectiveStatusKey`, `computeBankStats`, `fmtBandDisplay`, `promptMatchesQuery`, `computeFilterCounts`, `filterAndSortPrompts`.
  3. Cài đặt `buildHistoryItemView` sử dụng `rollupStatus` và `fmtDueDisplay` từ `./assignment-status`.
  4. Cài đặt `buildDuplicatePromptPayload(prompt: AssignmentPrompt)` với explicit allowlist field-by-field + `assignmentPromptCreateSchema.safeParse(candidate)`.
- **Success criteria:** Toàn bộ unit test Phase 2 pass xanh không cảnh báo type.
- **Verify:** `pnpm --filter web exec vitest run src/components/assignments/assignment-status.test.ts src/components/assignments/assignment-bank-helpers.test.ts` exits 0.

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
