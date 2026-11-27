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

Đồng bộ tài liệu thiết kế (`DESIGN.md` bao gồm mục `Lệch có chủ đích`), bổ sung assertion E2E cho `ClassInfoCard`, chạy toàn bộ gate kiểm định cục bộ, chạy `design:compare`, khôi phục mọi ảnh lịch sử bị ghi đè ngoài phạm vi, và chụp/soi trực quan 4 ảnh POT sạch PII trên 3 viewport + Light/Dark + `320px` reflow + keyboard focus theo `REVIEW.md` và `AGENTS.md`.

## Files to Modify

- Modify: `DESIGN.md` (dòng `111–119`: cập nhật mô tả `ClassInfoCard` và ghi rõ lý do gỡ footer vào mục `Lệch có chủ đích` so với `StudentClass.tsx` của design v2; không đụng snapshot lịch sử `docs/_reverse/*`)
- Modify: `apps/e2e/specs/student-class-detail.spec.ts` (bổ sung assertion trên `region[name="Thông tin lớp học"]` xác nhận hiển thị thông tin `<dl>` và không render `Buổi tới:` hay `\d+\s*tháng`)
- Create (POT artifacts): `plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png`

## Requirements

- [x] Cập nhật `DESIGN.md:112` (`thẻ thông tin <dl>`) và bổ sung ghi chú vào đoạn `Lệch có chủ đích` (`DESIGN.md:118-119`) giải thích rõ việc gỡ thanh footer tổng hợp khỏi `ClassInfoCard` so với `StudentClass.tsx` của design v2 (chấp nhận không lặp khung giờ/buổi tới trên lớp không lịch định kỳ hay tab phụ). Không sửa snapshot lịch sử `docs/_reverse/*`. <!-- Updated: Red Team Session 2026-11-26 - document intentional deviation in DESIGN.md and exclude docs/_reverse/* -->
- [x] Bổ sung assertion xác minh `ClassInfoCard` vào `apps/e2e/specs/student-class-detail.spec.ts` (sau khi mở `/classes/${fixture.classId}` ở dòng `145-154`) để E2E kiểm chứng thực tế trên trình duyệt. <!-- Updated: Red Team Session 2026-11-26 - add browser assertion for ClassInfoCard -->
- [x] Chạy toàn bộ local gates: `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter student test`, `pnpm test`.
- [x] Chạy targeted E2E: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-class-detail.spec.ts` (không chạy full E2E theo `AGENTS.md`), sau đó khôi phục ngay 3 ảnh tracked ngoài phạm vi tại `plans/261019-0648-student-portal-nav-menu/screenshots/`. <!-- Updated: Red Team Session 2026-11-26 - revert unrelated E2E screenshot overwrites -->
- [x] Chạy `pnpm design:compare --screens s-class-detail --force` (kiểm tra `gh auth status` trước; nếu môi trường không clone được `vinh19410/teacheros-design-v2` thì dùng `--side app --force`), sau đó khôi phục 6 ảnh baseline lịch sử tại `plans/261020-1446-378-redesign-design-v2/screenshots/` để không làm bẩn lịch sử `#378`. <!-- Updated: Red Team Session 2026-11-26 - handle design-v2 clone prereq and revert historical baseline overwrites -->
- [x] Chụp 4 ảnh POT trên `/student/classes/$classId` từ **stack E2E/seed cô lập sạch PII** (tài khoản synthetic `@test.local`/`@e2e.local` qua `seedQuizFixture` + `http://localhost:<port>`, tuyệt đối không dùng tài khoản thật hay `127.0.0.1` hay `pnpm dev`), kiểm tra đồng thời `320×812` reflow (`scrollWidth <= clientWidth`), 3 viewport (`1440×900` Light/Dark, `768×1024`, `375×812`) và `Tab` focus qua `mailto:` & tabs; soi trực quan cả 4 ảnh bằng `read_file` xác nhận **0 PII thật / 0 token / 0 cụm footer cũ / 0 lỗi hiển thị** trước khi commit. <!-- Updated: Red Team Session 2026-11-26 - concrete PII-safe Playwright POT + 320px reflow + Tab focus mechanism -->

## Implementation Steps

1. Cập nhật `DESIGN.md` dòng `111–119` (bỏ `+ footer` ở dòng `112` và thêm lý do gỡ bỏ vào mục `Lệch có chủ đích` ở dòng `118-119`). Bổ sung assertion cho `region[name="Thông tin lớp học"]` trong `apps/e2e/specs/student-class-detail.spec.ts`.
2. Chạy gate lint + typecheck + tests toàn workspace (`pnpm exec biome check . && pnpm check-types && pnpm test`).
3. Chạy targeted E2E `specs/student-class-detail.spec.ts` (ports `8100–8105`), sau đó chạy `git checkout -- plans/261019-0648-student-portal-nav-menu/screenshots/` để khôi phục 3 ảnh ngoài phạm vi.
4. Chạy `pnpm design:compare --screens s-class-detail --force` (fallback `--side app --force` nếu thiếu quyền/mạng tới `teacheros-design-v2`), sau đó khôi phục 6 ảnh baseline lịch sử bằng `git checkout -- plans/261020-1446-378-redesign-design-v2/screenshots/` (nếu thay đổi).
5. Chụp 4 ảnh POT (`plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png`) + đo `320×812` reflow + kiểm `Tab` focus trên `/student/classes/$classId` bằng script Playwright chạy trên dữ liệu synthetic (`@test.local`/`@e2e.local`) qua `http://localhost:<port>` (dọn sạch mọi tiến trình server tạm ngay sau khi xong), rồi mở đọc từng ảnh bằng `read_file` để kiểm chứng trực quan và xác nhận sạch PII. Kiểm tra `git status` đảm bảo không còn file nhị phân lịch sử nào ngoài 4 ảnh POT mới.

## Todo

- [x] Update `DESIGN.md` (line 112 + intentional deviation note) and add `ClassInfoCard` E2E assertion in `student-class-detail.spec.ts`
- [x] Run `pnpm exec biome check .`, `pnpm check-types`, and `pnpm test`
- [x] Run targeted E2E `specs/student-class-detail.spec.ts` and revert unrelated `student-nav-*.png` overwrites
- [x] Run `pnpm design:compare --screens s-class-detail --force` (or `--side app --force`) and revert historical `s-class-detail/*.png` overwrites
- [x] Capture and visually inspect 4 PII-free POT screenshots + verify `320px` reflow and `Tab` focus

## Success Criteria

- Toàn bộ gates (`biome`, `check-types`, workspace tests), targeted E2E và `design:compare` đều exit 0; `git status` sạch 9 file PNG lịch sử ngoài phạm vi.
- 4 ảnh POT sạch PII (`plans/reports/1013-class-info-card-{desktop,dark,tablet,mobile}.png`) xác nhận trực quan cụm footer cũ đã biến mất hoàn toàn, thẻ thông tin `<dl>` gọn gàng ở Light & Dark, 0px tràn ngang từ `320px` tới `1440px`, và điều hướng bàn phím `Tab` hoạt động đúng.
