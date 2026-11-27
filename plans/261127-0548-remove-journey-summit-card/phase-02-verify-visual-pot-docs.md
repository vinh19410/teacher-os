---
phase: 2
title: "Phase 2: Verification, Visual Audit, POT & Docs"
status: completed
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Verification, Visual Audit, POT & Docs

## Overview

Cập nhật E2E specs, `DESIGN.md`, `CHANGELOG.md`, chạy toàn bộ gates local, targeted E2E, `design:compare`, chụp & soi trực quan 4 ảnh POT sạch PII trên 3 viewport + Light/Dark + `320px` reflow + keyboard `Tab` focus + Light/Dark reload, và thực hiện local code review.

## Files to Modify / Create

- Modify: `apps/e2e/specs/student-session-detail.spec.ts`
- Modify: `apps/e2e/specs/student-class-detail.spec.ts`
- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`
- Create (POT artifacts): `plans/reports/1027-remove-journey-summit-card-{desktop,dark,tablet,mobile}.png`

## Requirements

- [ ] Cập nhật `apps/e2e/specs/student-session-detail.spec.ts` (~line 367) và `apps/e2e/specs/student-class-detail.spec.ts` (~line 160) để assert (scope trong section `"Buổi học"` khi phù hợp) `journey-syllabus-header`, `"Đích đến của bạn"`, `progressbar` có count `0`, đồng thời `journey-next-hero` và `"Lộ trình chinh phục"` hiển thị đúng.
- [ ] Cập nhật `DESIGN.md` (dòng `115` và `118-119`): bỏ mô tả `JourneySummitCard` và ghi nhận lý do gỡ bỏ trong `Lệch có chủ đích`. Tạo mới tiểu mục `### Removed` dưới `## 2026-11-27` trong `CHANGELOG.md`.
- [ ] Chạy local gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- [ ] Chạy targeted E2E: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-class-detail.spec.ts specs/student-session-detail.spec.ts`, sau đó revert `plans/261019-0648-student-portal-nav-menu/screenshots/`.
- [ ] Chạy `pnpm design:compare --screens s-class-detail --force` (fallback `--side app --force` nếu không clone được `teacheros-design-v2`), sau đó revert `plans/261020-1446-378-redesign-design-v2/screenshots/`.
- [ ] Chụp 4 ảnh POT sạch PII từ stack E2E/seed (`http://localhost:<port>`, dữ liệu `@test.local`/`@e2e.local`), kiểm `320px` reflow (`0px`), Light/Dark reload (`localStorage.theme`), và `Tab` focus; đọc soi cả 4 ảnh bằng `read_file`; dọn sạch server tạm.
- [ ] Chạy local code review với `code-reviewer` subagent (fresh context) và xử lý toàn bộ Critical/Important findings.
