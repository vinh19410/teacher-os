---
title: "Sửa lỗi checkbox bị span che và nâng cấp Chọn tất cả 3 trạng thái trong hộp thoại giao bài (#982)"
description: "Thay thế input peer sr-only bị span trang trí chặn click trong AssignClassPromptModal bằng native checkbox 16x16 hiển thị trực tiếp, ẩn Avatar khỏi accessible name và nâng cấp nút Chọn tất cả thành checkbox 3 trạng thái kèm badge phạm vi."
status: completed
priority: P1
effort: "2h"
issue: 982
branch: vinh19410/h-p-tho-i-giao-b-i-m-c-nh-ch-n-h-t-h-c-vi-n-b-m
tags: [bugfix, web, accessibility, ux-review, issue-982]
created: 2026-11-27
---

# Sửa lỗi checkbox bị span che và nâng cấp Chọn tất cả 3 trạng thái trong hộp thoại giao bài (#982)

## Overview

Trên hộp thoại giao bài tập (`AssignClassPromptModal`, `apps/web/src/components/classes/assign-class-prompt-modal.tsx`) mở từ trang chi tiết lớp (`/teacher/classes/$classId`), người dùng và trình kiểm thử không thể bấm trực tiếp vào ô checkbox học viên và dễ bỏ sót việc toàn lớp đang được chọn mặc định do 3 nguyên nhân gốc đã chứng minh trong mã nguồn:

1. **Checkbox học viên bị `span` trang trí đè lên (`apps/web/src/components/classes/assign-class-prompt-modal.tsx:937-970`):** Mỗi dòng học viên dùng `<input type="checkbox" className="peer sr-only" />` (hộp tuyệt đối 1×1px bị clip mà thẻ `<label>` không có `relative`) đặt trước `<span aria-hidden="true" className="grid size-4 ...">` không có `pointer-events-none`. Mọi thao tác bấm trực tiếp vào ô vuông hoặc hit-test (`document.elementFromPoint`, Playwright `.click()`/`.uncheck()`) đều bị `<span>` trang trí chặn lại, phải bấm vào phần tên mới đổi trạng thái. Đây là vị trí `peer sr-only` checkbox duy nhất trong toàn codebase.
2. **Accessible name của checkbox dính chữ viết tắt Avatar (`apps/web/src/components/ui/avatar.tsx:45-65` và `apps/web/src/components/classes/assign-class-prompt-modal.tsx:966`):** `<Avatar>` render text viết tắt (ví dụ `"NA"`) bên trong `<label>` mà không có `aria-hidden="true"`, khiến tên truy cập của checkbox bị ghép thành `"NA Nguyễn Văn A"` thay vì `"Nguyễn Văn A"`.
3. **Điều khiển «Chọn tất cả» mờ nhạt và thiếu ngữ nghĩa 3 trạng thái (`apps/web/src/components/classes/assign-class-prompt-modal.tsx:880-888`):** Hiện chỉ có một `<button className="text-muted-foreground text-xs">` đổi nhãn `"Bỏ chọn tất cả"` / `"Chọn tất cả"`, không có ngữ nghĩa checkbox, không có trạng thái `indeterminate` khi chọn một phần, và chưa làm nổi bật phạm vi `"Cả lớp"` vs `"Chọn lọc"` ngay tại danh sách học viên.

Kế hoạch này tuân thủ hợp đồng bàn giao TDD (`--tdd --advice`) với phương án **Option A** đã được người dùng xác nhận qua `ask_question`: giữ mặc định chọn hết học viên đang học (tối đa `MAX_STUDENTS_PER_ASSIGN = 100`, bảo toàn cơ chế tự bù học viên chờ xác nhận `#958` và 6 E2E spec hiện có), đồng thời sửa triệt để hit-target checkbox và nâng cấp thanh «Chọn tất cả» thành checkbox 3 trạng thái nổi bật kèm badge phạm vi.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - `apps/web/src/components/classes/assign-class-prompt-modal.tsx`:
    - Thay cặp `peer sr-only` + decorative `<span>` (dòng `946-965`) bằng native `<input type="checkbox">` 16×16px hiển thị thật (`appearance-none` + token `--input` / `--primary` + `focus-visible:shadow-[var(--focus-ring)]` + `forced-colors:appearance-auto`) và icon `<Check aria-hidden="true" className="pointer-events-none absolute ..." />` trong wrapper `relative inline-flex size-4 shrink-0 items-center justify-center` (không dùng `overflow-hidden` để không cắt focus ring).
    - Bọc `<Avatar>` (dòng `966`) trong `<span aria-hidden="true" className="shrink-0">` để tên truy cập checkbox chỉ còn `s.name`.
    - Nâng cấp nút dòng `880-888` thành thanh header cố định (không cuộn theo list) trên đỉnh card danh sách học viên với checkbox 3 trạng thái cố định nhãn `"Chọn tất cả"` (sync `indeterminate` qua `useRef`/`useEffect` + `aria-checked={isPartiallySelected ? "mixed" : undefined}`, icon `<Check>`/`<Minus>` `pointer-events-none`), gợi ý phụ `"Bấm để bỏ chọn hết"` / `"Bấm để chọn tất cả"`, badge phạm vi `data-testid="assign-students-scope-badge"` (`"Cả lớp"` chỉ khi `willAssignWholeClass === true`, `"Chưa chọn"` khi 0, `"Chọn lọc"` khi bán phần hoặc lớp `> 100` HV), bọc `<fieldset aria-labelledby="assignment-students-heading">` và một vùng `aria-live="polite" aria-atomic="true"` duy nhất cho bộ đếm + badge.
    - Giữ nguyên contract text `({visibleSelectedStudentIds.length}/{enrolledStudents.length})` và footer `Giao cho ${visibleSelectedStudentIds.length} học viên`.
  - `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`: cập nhật test 105 HV (`855-858`) sang checkbox `"Chọn tất cả"` + kiểm tra scope badge, và bổ sung test TDD cho direct checkbox, accessible name sạch, không `sr-only`, và 3 trạng thái `checked`/`indeterminate`/`unchecked`.
  - `apps/e2e/specs/class-assign.spec.ts`: bổ sung test E2E `#982` kiểm chứng `document.elementFromPoint` trả về `INPUT`, `.uncheck()` không `{ force: true }`, bàn phím `Tab` + `Space`, 3 trạng thái `"Chọn tất cả"`, reflow `320px/375px/768px/1440px` cả Light & Dark, chụp 6 ảnh POT opt-in (`CAPTURE_POT_982=1`) dùng `fileURLToPath`, và submit chọn lọc (`targetScope: "selected"`).
  - `CHANGELOG.md`: thêm 1 mục `### Fixed` dưới `## 2026-11-27`.
- **Explicit Non-Goals:**
  - Không đổi chính sách mặc định sang bỏ chọn tất cả (Option B đã bị loại theo quyết định người dùng).
  - Không sửa `packages/ui/src/components/checkbox.tsx` hay `apps/web/src/components/ui/avatar.tsx` dùng chung toàn cục.
  - Không thay đổi API server (`POST /api/classes/:id/assignments`), `MAX_STUDENTS_PER_ASSIGN = 100`, hay bump version `package.json` (beta PR vào `develop`).
  - Không chạy full E2E suite ở local (`AGENTS.md`).

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Sửa triệt để lỗi checkbox học viên bị `span` đè lên, làm sạch accessible name (ẩn Avatar) và nâng cấp thanh «Chọn tất cả» thành checkbox 3 trạng thái + badge phạm vi rõ ràng theo TDD | P1 |
| 2 | Chứng minh trên trình duyệt thật (Chromium E2E hit-test + bàn phím + 3 viewport Light/Dark + 320px reflow), vượt qua toàn bộ gates (`biome`, `check-types`, `web test`, `design:compare`) và cập nhật `CHANGELOG.md` | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: TDD Unit Tests & Checkbox / Tri-State Select All Fix](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Targeted E2E Regression, Visual POT, Gates & Changelog](./phase-02-verification-e2e-and-pot.md) | Completed |

## Success Criteria

- [x] `AssignClassPromptModal` dùng native `<input type="checkbox">` 16×16px hiển thị thật (không `sr-only`), `pointer-events-none` trên SVG overlay, `forced-colors:appearance-auto`, và bọc `<Avatar>` trong `<span aria-hidden="true" className="shrink-0">`.
- [x] Thanh đầu danh sách học viên có checkbox `"Chọn tất cả"` 3 trạng thái (`checked` / `indeterminate` + `aria-checked="mixed"` / `unchecked`), nhãn cố định `"Chọn tất cả"`, đồng bộ `willAssignWholeClass` (`"Cả lớp"` chỉ khi chọn đủ toàn bộ lớp `<= 100` HV; lớp `> 100` HV hiện `"Chọn lọc"`), giữ nguyên `"(X/Y)"` và footer `"Giao cho N học viên"`.
- [x] Unit tests trong `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx` (kể cả test lớp 105 HV đã cập nhật) và `'src/routes/_auth/classes/$classId.test.tsx'` pass 100%.
- [x] Targeted E2E `apps/e2e/specs/class-assign.spec.ts` chứng minh `elementFromPoint` trả về `<input type="checkbox">`, `.uncheck()` không cần `{ force: true }`, điều hướng bàn phím `Tab` + `Space`, không tràn ngang ở `320px/375px/768px/1440px` (Light & Dark), và thu đủ 6 ảnh POT sạch PII trong `plans/reports/982-assign-modal-*.png`.
- [x] `pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, `CI=1 pnpm --filter web test`, `pnpm design:compare --screens t-class-detail --force` (kiểm trang nền `/classes/$classId` và khôi phục ảnh lịch sử nếu ghi đè) đều pass (exit `0`), và `CHANGELOG.md` được cập nhật đúng quy ước dưới `## 2026-11-27` (`### Fixed`).

## Handover Note (`--advice`)

Kế hoạch này đạt chuẩn bàn giao (`advice-handover-plan.md`) cho executor model: mỗi phase tách thành các task tự chứa kèm đường dẫn tệp/symbol cụ thể, điều kiện TDD Red/Green cơ học, lệnh `Verify` chính xác và khối `## Failure Protocol` yêu cầu DỪNG ngay và hỏi `kongming` nếu bất kỳ bước kiểm chứng nào thất bại.

## Red Team Review

### Session 1 — 2026-11-27
**Reviewers:** 2 parallel fresh-context `code-reviewer` subagents (`Security Adversary`, `Assumption Destroyer` — Light tier `Fact Checker`).
**Findings:** 6 deduplicated (6 accepted, 0 rejected; đã được người dùng chốt áp dụng qua `ask_question`).
**Severity breakdown:** 1 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Unit test TDD (Task 1.1) khẳng định `"Chưa chọn học viên"` và nút `disabled` ở `(0/2)` khi chưa chọn đề (`promptOk === false`), và E2E (Task 2.1) có phantom assertion trên `disabled` | Critical | Accept | Phase 1 (Task 1.1), Phase 2 (Task 2.1) |
| 2 | Đặc tả Task 1.2 thiếu wrapper `<span className="relative ...">` cho `selectAllRef`, thiếu guard render icon có điều kiện và thiếu tô nền/viền `border-primary bg-primary` khi `indeterminate` | High | Accept | Phase 1 (Task 1.2) |
| 3 | Kiểm thử Dark mode trong Task 2.1 thiếu đồng bộ `document.documentElement.classList` + `expect(hasDark)` và bỏ sót kiểm tra overflow trên thân modal `overflow-y-auto` + danh sách học viên | High | Accept | Phase 2 (Task 2.1) |
| 4 | `design:compare --screens t-class-detail --force` không mở `AssignClassPromptModal`, phụ thuộc repo `teacheros-design-v2` và ghi đè 6 ảnh lịch sử | High | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 5 | Thiếu `scrollIntoViewIfNeeded()` trước `boundingBox()` / `elementFromPoint()` trong Task 2.1 | Medium | Accept | Phase 2 (Task 2.1) |
| 6 | Thứ tự `classGroup.studentIds` cần ràng buộc rõ (`An Học viên 1` trước, `Bình Học viên 2` sau) cho kiểm thử `Tab` + `Space` trong Task 2.1 | Medium | Accept | Phase 2 (Task 2.1) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-e2e-and-pot.md`
- Decision deltas checked: 6
- Reconciled stale references: 6
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-27
**Trigger:** `ak-vibe` Step 4 validation gate (Light tier — 2 phases) và chốt Option A + Red-Team Session 1.
**Questions asked:** 2 (`ask_question`: chốt Option A vs Option B trước lập kế hoạch; chốt áp dụng toàn bộ 6 phát hiện Red-Team).

#### Questions & Answers
1. **[Product Fork — Default Student Selection]** Hành vi mặc định khi mở hộp thoại «Giao bài tập».
   - **Answer:** `(Recommended) Giữ mặc định chọn tất cả học viên đang học + nâng cấp thanh «Chọn tất cả» thành checkbox 3 trạng thái nổi bật kèm nhãn phạm vi («Cả lớp» / «Chọn lọc»)`
2. **[Red-Team Adjudication]** Xử lý 6 phát hiện Red-Team (1 Critical, 3 High, 2 Medium).
   - **Answer:** `(Recommended) Đồng ý áp dụng toàn bộ 6 phát hiện Red-Team vào kế hoạch rồi triển khai luôn`

### Verification Results
- **Tier:** Light (`Fact Checker` qua 2 reviewer độc lập + `ak plan validate`)
- **Claims checked:** 18
- **Verified:** 18 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-verification-e2e-and-pot.md`
- Decision deltas checked: 6
- Reconciled stale references: 0 (đã đồng bộ xong ở Red Team Session 1)
- Unresolved contradictions: 0

<!-- slug: 982-fix-assign-modal-checkbox-select-all -->
