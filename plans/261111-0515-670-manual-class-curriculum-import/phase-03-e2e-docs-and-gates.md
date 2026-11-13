---
phase: 3
title: "Phase 3: E2E, cập nhật DESIGN.md / CHANGELOG.md, design:compare, POT & cổng kiểm tra"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: E2E, cập nhật DESIGN.md / CHANGELOG.md, design:compare, POT & cổng kiểm tra

<!-- Updated: Red Team & Validation Session 1 - Applied RT-10, RT-11: scoped StatCard locators in E2E Test B, added t-attendance + verdict.md to design:compare sync, and explicit 3-viewport light/dark POT screenshot capture into plans/reports/670-*.png -->

## Goal

Khóa hành vi toàn trình bằng Playwright E2E (`syllabus-class-curriculum.spec.ts` + hồi quy các spec liên quan), cập nhật `DESIGN.md`, `CHANGELOG.md` và `verdict.md`, cập nhật bộ ảnh đối chiếu `t-class-detail` + `t-attendance` qua `pnpm design:compare`, chụp bộ ảnh bằng chứng POT 3 viewport × light/dark lưu tại `plans/reports/670-*.png`, và chạy toàn bộ cổng kiểm tra chất lượng của monorepo.

## Files to Create / Modify

- Modify: `apps/e2e/specs/syllabus-class-curriculum.spec.ts`
- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*.png`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png`
- Create: `plans/reports/670-projected-sessions-desktop-1440x900-light.png`
- Create: `plans/reports/670-projected-sessions-desktop-1440x900-dark.png`
- Create: `plans/reports/670-projected-sessions-tablet-768x1024-light.png`
- Create: `plans/reports/670-projected-sessions-tablet-768x1024-dark.png`
- Create: `plans/reports/670-projected-sessions-mobile-375x812-light.png`
- Create: `plans/reports/670-projected-sessions-mobile-375x812-dark.png`

## Tasks & Steps

### Task 3.1 — Mở rộng E2E Test B trong `apps/e2e/specs/syllabus-class-curriculum.spec.ts`, chụp ảnh POT 3 viewport × light/dark và chạy hồi quy E2E
- **Goal**: Bổ sung kiểm tra `StatCard` + chiếu đủ 3 buổi dự kiến + kiểm tra không tràn ngang và chụp 6 ảnh POT (3 viewport × light/dark) ngay sau khi nhập giáo trình vào lớp trống trong Test B của `apps/e2e/specs/syllabus-class-curriculum.spec.ts`, đồng thời chạy hồi quy các spec liên quan.
- **Target files and symbols**:
  - `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (`test("B: gán sau — lớp trống nhập từ template; nhập lần hai bằng API là 409", ...)`, quanh dòng `206-224`)
  - `plans/reports/670-projected-sessions-*.png`
- **Steps**:
  1. Trong `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (Test B, ngay sau khi nhập template 3 bài thành công và kiểm tra nút `"Sắp xếp buổi"` enabled tại dòng `210`):
     - Kiểm tra 2 thẻ `StatCard` bằng locator neo chặt theo nhãn duy nhất (tránh strict-mode đụng badge số thứ tự buổi `3`):
       - `const doneStatCard = page.locator("div.rounded-xl", { has: page.getByText("buổi đã học", { exact: true }) }); await expect(doneStatCard.getByText("0/3", { exact: true })).toBeVisible();`
       - `const syllabusStatCard = page.locator("div.rounded-xl", { has: page.getByText("bài trong syllabus", { exact: true }) }); await expect(syllabusStatCard.getByText("3", { exact: true })).toBeVisible();`
     - Chuyển sang tab `"Buổi học & luyện tập"` (`getByRole("tab", { name: "Buổi học & luyện tập", exact: true })`), khẳng định Empty State `"Chưa có buổi học nào"` đã ẩn (`toHaveCount(0)`), danh sách `[data-testid="session-row"]` có đúng `3` dòng mang tiêu đề `"Buổi A1"`, `"Thi giữa kỳ A"`, `"Buổi B1"`, và không có nút `"+ Thêm buổi học"` hay `"+ Thêm buổi"`.
     - Lặp qua 3 viewport chuẩn (`desktop-1440x900`: `1440×900`, `tablet-768x1024`: `768×1024`, `mobile-375x812`: `375×812` theo mẫu `apps/e2e/specs/649-screenshots.spec.ts:11-54`): ở mỗi viewport kiểm tra `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, chụp ảnh light `plans/reports/670-projected-sessions-${vp.name}-light.png`, bật class `dark` chụp `plans/reports/670-projected-sessions-${vp.name}-dark.png` rồi gỡ class `dark`, cuối cùng khôi phục viewport `1280×720` trước bước kiểm tra gọi lặp API trả `409`.
  2. Chạy bộ spec E2E liên quan trên cổng tách biệt `8100/8101/8103/8104/8105`:
     - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/syllabus-class-curriculum.spec.ts specs/projected-sessions.spec.ts specs/class-sessions-manage-modal.spec.ts`
- **Success criteria**: Cả 3 file spec Playwright E2E chạy xanh 100% và sinh đủ 6 file ảnh `plans/reports/670-projected-sessions-*.png`.
- **Verify**: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/syllabus-class-curriculum.spec.ts specs/projected-sessions.spec.ts specs/class-sessions-manage-modal.spec.ts && ls -1 plans/reports/670-projected-sessions-*.png | wc -l | grep -Fx 6` kết thúc với mã thoát `0`.

### Task 3.2 — Cập nhật `DESIGN.md`, `CHANGELOG.md`, `verdict.md`, chạy `pnpm design:compare` cho `t-class-detail,t-attendance` và vượt qua toàn bộ cổng chất lượng
- **Goal**: Cập nhật tài liệu thiết kế + nhật ký thay đổi + bảng đối chiếu `verdict.md`, tái tạo bộ ảnh đối chiếu `t-class-detail` và `t-attendance`, và vượt qua toàn bộ cổng `biome check` + `check-types`.
- **Target files and symbols**:
  - `DESIGN.md` (dòng `150-152`)
  - `CHANGELOG.md` (mục `## 2026-11-11` → `### Fixed`)
  - `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` (dòng `228`)
  - `plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/*.png`
  - `plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png`
- **Steps**:
  1. Trong `DESIGN.md` tại dòng `150-152`, cập nhật mô tả của nút hành động chính trên `PageHead` khớp thực tế sau `#649` và `#670`: khi lớp đã gắn giáo trình (`sy` tồn tại) thì hiện **"Sắp xếp buổi"** mở modal Quản lý buổi (#221); khi lớp chưa có giáo trình và đang ở chế độ thủ công hoặc chưa phát sinh buổi thật (`isManual || lessons.length === 0`) thì hiện **"+ Thêm buổi học"** mở modal thêm buổi thủ công (#649); khi lớp `auto` đã có dòng `lesson` thật nhưng không gắn giáo trình thì ẩn cả hai nút để không dẫn vào thao tác `409` (#670, đồng thời gỡ nhánh empty state cũ của #521).
  2. Trong `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` tại dòng `228`, cập nhật ghi chú dòng `Header` để ghi nhận trên lớp seed `auto` đã có `lesson` thật nhưng không gắn giáo trình (`#670`), header chỉ hiển thị `"Giao bài tập"` outline (ẩn cả `"Sắp xếp buổi"` lẫn `"+ Thêm buổi học"`).
  3. Trong `CHANGELOG.md` dưới `## 2026-11-11` → `### Fixed`, thêm một gạch đầu dòng tiếng Việt mô tả sửa lỗi `#670`.
  4. Chạy `pnpm design:compare --screens t-class-detail,t-attendance --side both --label new --force` để chụp và ghép lại đủ 12 ảnh đối chiếu (`6` ảnh `t-class-detail` + `6` ảnh `t-attendance`).
  5. Chạy `pnpm check` (hoặc `pnpm exec biome check .`) và `pnpm check-types` trên toàn workspace.
- **Success criteria**: `DESIGN.md`, `CHANGELOG.md`, `verdict.md` và bộ ảnh `t-class-detail` + `t-attendance` được cập nhật sạch sẽ; `pnpm design:compare`, `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter server test`, và `pnpm --filter web test` đều exit `0`.
- **Verify**: `pnpm design:compare --screens t-class-detail,t-attendance --side both --label new --force && pnpm exec biome check . && pnpm check-types` kết thúc với mã thoát `0`.

## Verification

- [ ] Ba spec E2E (`syllabus-class-curriculum.spec.ts`, `projected-sessions.spec.ts`, `class-sessions-manage-modal.spec.ts`) exit `0` và sinh đủ 6 ảnh `plans/reports/670-projected-sessions-*.png`.
- [ ] `pnpm design:compare --screens t-class-detail,t-attendance --side both --label new --force` exit `0`.
- [ ] `pnpm exec biome check .` và `pnpm check-types` exit `0`.

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
