---
phase: 3
title: "Phase 3: E2E Review and Docs"
status: done
---

# Phase 3: E2E Review and Docs

> **Goal:** Kiểm chứng end-to-end luồng Tạm dừng / Mở lại (Teacher Web + Student Portal) qua Playwright spec lẻ, đối chiếu visual regression 3 viewport Light/Dark, review mã nguồn đa góc nhìn + Kongming, và cập nhật `CHANGELOG.md` + reverse gaps docs trước khi ship beta.
> **Skill hints:** Dùng đúng port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`; **tuyệt đối không chạy full E2E suite ở local**.

## Tasks

- [x] **Task 3.1: Targeted E2E Spec (`apps/e2e/specs/class-status.spec.ts`) & Visual Screenshots (POT)**
  - **Target files & symbols:**
    - `apps/e2e/specs/helpers.ts` (đọc trước để tái dùng `signUpViaApi` và seed `@test.local` trên DB `boot:api` mới sạch)
    - `apps/e2e/specs/class-status.spec.ts` (spec mới)
    - `apps/e2e/specs/class-operations.spec.ts` (`L74`: kiểm tra nếu badge header `"Đang học"` trùng strict-mode và cập nhật selector nếu cần)
    - `plans/reports/694-*.png` (screenshot sạch từ tài khoản `@test.local` tổng hợp cho POT trên `#694`)
  - **Steps:**
    1. Đọc `apps/e2e/specs/helpers.ts` và `apps/e2e/specs/class-operations.spec.ts:55-90`.
    2. Viết `apps/e2e/specs/class-status.spec.ts` phủ trọn vẹn:
       - Giáo viên tạo lớp + 1 buổi hoàn thành lịch sử + buổi sắp tới + học viên `invited` và `active`.
       - Tạm dừng qua `ClassStatusModal` trên `/classes/$classId` -> kiểm tra reload vẫn `"Tạm dừng"`, lọc `"Tạm dừng"` trên `/classes` (URL `?filter=`), buổi sắp tới ẩn khỏi `/schedule` và `/dashboard` nhưng lịch sử giữ nguyên, nút giảng dạy/kích hoạt bị khóa, `AddStudentModal` ẩn lớp `paused`.
       - Cổng học viên: badge `"Tạm dừng"`, nút `"Tham gia lớp"` disabled cho học viên `invited`, `"Buổi tới"` không hiển thị trên chi tiết lớp.
       - Giáo viên bấm `"Mở lại lớp"` -> lịch sắp tới và nút thao tác khôi phục nguyên vẹn.
    3. Chụp screenshot POT từ `boot:api` fresh DB với seed `@test.local` tổng hợp tại 3 viewport (`1440×900`, `768×1024`, `375×812`) Light + Dark cho `/classes` & `/classes/$classId` vào `plans/reports/`, check trực quan không dính PII/email thật (sidebar footer, header, danh sách học viên), kiểm tra reflow `320px` và keyboard Tab focus.
  - **Success criteria:** `specs/class-status.spec.ts` (và `specs/class-operations.spec.ts` nếu ảnh hưởng selector) pass ổn định trên stack Playwright thật; ảnh POT sạch PII.
  - **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/class-status.spec.ts`

- [x] **Task 3.2: Visual Regression (`design:compare`)**
  - **Target files & symbols:**
    - `scripts/design-compare/`
  - **Steps:**
    1. Chạy `pnpm design:compare --force --screens t-classes,t-class-detail --side both --label new`.
    2. Tự kiểm tra ảnh ghép so với `teacheros-design-v2` đảm bảo đúng token màu/typography/badge trong `DESIGN.md`, không trắng trang/rỗng pixel.
  - **Success criteria:** Lệnh thoát mã `0`, không sai lệch layout hay vi phạm token `DESIGN.md`.
  - **Verify:** `pnpm design:compare --force --screens t-classes,t-class-detail --side both --label new`

- [x] **Task 3.3: Local Multi-Perspective Code Review (`--advice`) & Docs Sync**
  - **Target files & symbols:**
    - `CHANGELOG.md`
    - `docs/_reverse/classes/reverse-gaps.md` (`OQ-1` tại `L5`, Conflict `L32`)
  - **Steps:**
    1. Chạy `/ak-code-review --pending --advice` (gọi `code-reviewer` + `kongming`) trên toàn bộ diff trước PR; xử lý dứt điểm mọi phát hiện Critical/Important.
    2. Kiểm tra `CHANGELOG.md` (đọc trước để theo đúng format tiếng Việt) và `docs/_reverse/classes/reverse-gaps.md` để cập nhật OQ-1 đã được giải quyết bởi `#694`.
  - **Success criteria:** Zero Critical/Important review findings; docs phản ánh đúng trạng thái 2 chiều `active ↔ paused`.
  - **Verify:** `git diff --stat` sạch các file đúng scope

- [x] **Task 3.4: Full Local Quality Gate Verification (Pre-Ship)**
  - **Target files & symbols:** Toàn bộ monorepo.
  - **Steps:**
    1. Chạy `pnpm check:fix` nếu cần sửa format/import rồi xác minh lại bằng `pnpm exec biome check .` (read-only).
    2. Chạy đầy đủ `pnpm check-types`, `pnpm test`, `pnpm build`, và re-run `specs/class-status.spec.ts` (+ `specs/class-operations.spec.ts` nếu sửa selector) sau lần sửa code cuối.
    3. Chạy checkpoint cuối cùng của `kongming` trước khi sang bước ship Beta PR (và nhớ nhúng ảnh POT bằng permalink `<commit-sha>` theo `AGENTS.md` sau khi push/merge).
  - **Success criteria:** Toàn bộ local gates pass không lỗi, không skip test.
  - **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test && pnpm build`

## Failure Protocol

If any verification step fails unexpectedly:
1. STOP immediately — do NOT touch code yet.
2. Invoke `kongming` via `invoke_subagent(TypeName="kongming", Model="inherit")` with the failing command, exact stderr/test diff, and relevant files.
3. Wait for diagnosis and apply the verified fix.
4. Re-run the full verification gate to confirm clean pass.
