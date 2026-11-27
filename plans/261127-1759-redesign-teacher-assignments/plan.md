---
title: "Redesign /teacher/assignments theo open-design/assignments.html"
description: "Thiết kế lại trang Ngân hàng bài tập giáo viên (/teacher/assignments) theo master-detail layout mới, hỗ trợ giao đề cho nhiều lớp, xem lịch sử giao thật (#979, #983), nhân bản sang bản nháp và xóa bản nháp an toàn trên Light & Dark."
status: completed
priority: P1
effort: "12h"
branch: vinh19410/feat-redesign-teacher-assignments
tags: [feature, frontend, backend, api, ui-redesign]
blockedBy: []
blocks: []
created: 2026-11-27
---

# Plan: Redesign `/teacher/assignments` theo `open-design/assignments.html`

## Outcome

Giáo viên mở `/teacher/assignments` nhìn thấy trạm điều phối ngân hàng bài tập hai cột (desktop `>= 1360px`) / drawer (`< 1360px`) theo thiết kế mới tại [open-design/assignments.html](../../open-design/assignments.html) trên nền `AppShell` (`sidebar-07`, Light mặc định + Dark):
- **Khối KPI 4 ô bấm lọc trạng thái** (`Đề trong ngân hàng`, `Đang giao cho lớp`, `Sẵn sàng, chưa giao`, `Bản nháp`) đồng bộ URL.
- **Thanh lọc gọn & tìm kiếm tiếng Việt không dấu** (debounce 300ms lên `?q=`, phím tắt `/`, chọn `Phần thi` có `<optgroup>` theo kỹ năng, `Trạng thái`, `Sắp xếp`, dải chip kỹ năng cuộn ngang, chip bộ lọc đang bật + `Xóa bộ lọc`, bộ đếm `aria-live="polite"`).
- **Bảng danh sách đề `@container`** co về thẻ dọc ở màn hẹp, điều hướng bàn phím mũi tên lên/xuống, thao tác nhanh (`Giao cho lớp` / `Hoàn thiện bản nháp`, `Nhân bản`).
- **Panel xem trước 2 tab**: `Đề phía học viên` (giữ toàn bộ rich preview, tuyệt đối không lộ `Band` hay đáp án) và `Lịch sử giao` thật từ `data.classAssignments` (đóng #979).
- **3 luồng thao tác thật qua kernel**: Giao 1 đề cho nhiều lớp từ ngân hàng (đóng #983, dùng `<Modal>` để lịch `DatePickerInput` không bị Top Layer che), Nhân bản sang bản nháp (`POST /api/assignments/prompts`), và Xóa bản nháp (`DELETE /api/assignments/prompts/:id` nguyên tử chống cascade xóa bài làm học viên).

## Advisor Scope Lock (`--advice`)

- **Locked Scope:** Master-detail redesign trong `AppShell` (`max-w-7xl`), 4 KPI tiles, toolbar + URL sync (`?q=&skill=&part=&status=&sort=`), bảng `@container` tối ưu bề rộng `1110px` ở `1440px`, preview sticky/drawer 2 tab (`Band` chỉ hiện ở chrome giáo viên `.preview-head` & bảng, cấm trong tờ đề học viên `PromptStudentPaper` theo #847), nhãn `"Đã giao {N} lớp"`, modal giao nhiều lớp dùng `<Modal>` + `DatePickerInput`/`TimeInput24h` + `{ skipRefresh: true }` + xử lý partial failure, nhân bản an toàn qua `buildDuplicatePromptPayload`, xóa nháp thật qua `DELETE /api/assignments/prompts/:id` có RBAC `canPublishGrade` + guard 3 bảng tham chiếu, Light & Dark semantic tokens, cập nhật test + E2E liên quan + `design:compare` + POT + `DESIGN.md` + ship beta vào `develop`.
- **Explicit Non-Goals:**
  1. Không chỉnh sửa `AppShell`, sidebar, topbar hay tìm kiếm toàn cục ⌘K.
  2. Không làm nút `"Hoàn tác"` giả phía client sau khi xóa bản nháp; xóa nháp là xóa thật có hộp thoại xác nhận.
  3. Không hỗ trợ xóa đề `ready` hoặc đề đang được tham chiếu (`class_assignment`, `assignment_test_part`, `study_pack_item`).
  4. Không trộn danh sách `assignmentTests` (full test) vào bảng `/assignments` — mục `"Đề thi nhiều phần"` chỉ điều hướng sang `/assignments/tests/new`.
  5. Modal `"Giao đề cho lớp"` trên `/assignments` chỉ giao cả lớp (`active` roster, tối đa 100 HV) theo một hạn nộp chung; không chọn lẻ học viên, không gắn `sessionDate`, không có ô ghi chú, và không giao lại lớp đã nhận đề (các luồng đó giữ ở `/classes/$classId`).
  6. Không thay đổi hành vi backend của `POST /api/classes/:id/assignments`.
  7. Không thêm trình soạn đề inline (`Sửa`/`Hoàn thiện bản nháp` đi `/assignments/new?promptId=...`, `Xem trước` đi `/assignments/preview?id=...`).
  8. Không chạy full E2E suite ở local (chỉ chạy các spec liên quan với port override 8100–8105).

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Backend `DELETE /api/assignments/prompts/:id` & Web Kernel](./phase-01-delete-draft-api-and-kernel.md) | Completed |
| 2 | [Phase 2: Status `"Đã giao N lớp"`, URL/Filter/Sort & Duplicate Helpers](./phase-02-bank-helpers-and-status.md) | Completed |
| 3 | [Phase 3: UI Redesign `/teacher/assignments` & Modals](./phase-03-redesign-ui-and-modals.md) | Completed |
| 4 | [Phase 4: E2E Updates, Visual Audit & Local Gates](./phase-04-e2e-visual-audit-and-gates.md) | Completed |
| 5 | [Phase 5: Code Review, Docs Sync, Ship Beta PR, POT & CI Convergence](./phase-05-review-docs-ship-and-ci.md) | Completed |

## Acceptance Criteria

1. `DELETE /api/assignments/prompts/:id` xóa nguyên tử bản nháp chưa tham chiếu (`200 { id }`), trả `403` cho `ta`, `404` cho org khác / library / demo / không tồn tại, `409 PROMPT_DELETE_NOT_DRAFT` cho đề `ready`, và `409 PROMPT_DELETE_REFERENCED` khi có mặt trong `class_assignment`, `assignment_test_part`, hoặc `study_pack_item` (bảo toàn 100% bài làm học viên dù đề từng bị lật `ready → draft`).
2. Giao diện `/teacher/assignments` đạt đúng bố cục và tương tác của `open-design/assignments.html` trong `AppShell`: 4 KPI tiles lọc trạng thái, toolbar với search không dấu debounce 300ms + phím `/`, dropdown `Phần thi` có `<optgroup>`, `Trạng thái`, `Sắp xếp`, chip kỹ năng cuộn ngang, chip xóa bộ lọc, `@container` bảng 5 cột trên desktop (`1440×900` không sập card), `Band` chỉ xuất hiện ở bảng & header giáo viên (không xuất hiện trong `PromptStudentPaper` / `#847`).
3. Tab `Lịch sử giao` hiển thị đúng các lượt giao từ `data.classAssignments` (tỷ lệ nộp, thanh tiến độ, trạng thái `Đang mở`/`Đã nộp hết`/`Quá hạn · thiếu N`, hạn VN, link tới lớp) — giải quyết #979.
4. Giao 1 đề cho nhiều lớp từ `/teacher/assignments` bằng `<Modal>` + `DatePickerInput`/`TimeInput24h`, validate theo giờ VN, dùng `{ skipRefresh: true }` + 1 lần `refresh()`, xử lý partial failure không giao trùng — giải quyết #983.
5. Nhân bản tạo bản nháp mới qua `POST /api/assignments/prompts` với payload chuẩn hóa cho cả 6 kỹ năng; Xóa nháp gọi `DELETE /api/assignments/prompts/:id` và tồn tại qua reload.
6. Không tràn ngang (`scrollWidth <= innerWidth`) ở `1440×900`, `768×1024`, `375×812`, `320×568` cả Light & Dark; `pnpm check`, `pnpm check-types`, unit tests server/web/api, `pnpm design:compare` và 5 spec E2E liên quan pass 100%.

## Extension Trace

Ranh giới ổn định: `assignmentPrompt` bank (`GET /api/kernel`, `POST /api/assignments/prompts`, `DELETE /api/assignments/prompts/:id`) và `POST /api/classes/:id/assignments`. Nếu về sau hỗ trợ giao hàng loạt full-test hoặc bài tự luyện từ ngân hàng, chỉ cần mở rộng modal picker sang union item hoặc bổ sung endpoint batch riêng; không cần tạo registry hay factory trừu tượng ngay lúc này.

## Red Team Review

### Session — 2026-11-27
**Findings:** 4 Critical/High catches integrated from `kongming` Checkpoint #1 & codebase scan (0 unresolved).

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Native `<dialog>.showModal()` puts modal in Top Layer above `DatePickerInput` calendar popover (`z-[110]`), blocking date selection | Critical | Accept — use `<Modal>` from `@/components/ui/modal` | Phase 3 |
| 2 | `class_assignment.prompt_id` has `ON DELETE CASCADE` while `PATCH /prompts/:id` allows `ready → draft`; deleting a flipped draft would wipe student attempts | Critical | Accept — atomic `DELETE ... WHERE status = 'draft' AND NOT EXISTS (...)` across `class_assignment`, `assignment_test_part`, `study_pack_item` | Phase 1 |
| 3 | `AppShell` inner width at `1440px` is `1110px` (not `1440px`); `392px` preview + `140/56/148/116` columns squeeze title to `138px` and collapse `@container < 640px` at `1360–1386px` | High | Accept — preview `w-[360px] 2xl:w-[392px]` and columns `minmax(0,1fr) 128px 48px 136px 80px` (`gap-3 px-4`) | Phase 3 |
| 4 | `assignment-bank.spec.ts` clicks `"Xem trước"` on a draft prompt and asserts `Band 7.0` absence in `PromptPreviewAside`; `PromptPreviewAside` tests expect `Band` omitted from student paper | High | Accept — keep `"Xem trước"` button on both `ready` & `draft`; separate `PromptStudentPaper` (no Band) from `.preview-head` (teacher chrome) | Phase 3, Phase 4 |

## Validation Log

- Validated structure against `advice-handover-plan.md` (Goal / Target files and symbols / Steps / Success criteria / Verify / Failure Protocol per phase) and `ak plan validate`.

<!-- slug: redesign-teacher-assignments -->
