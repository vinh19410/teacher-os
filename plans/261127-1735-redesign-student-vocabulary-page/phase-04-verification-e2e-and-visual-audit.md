---
phase: 4
title: "Phase 4: QA Gates, Targeted E2E, Visual Audit & Docs"
status: completed
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: QA Gates, Targeted E2E, Visual Audit & Docs

## Goal
Chạy toàn bộ static/unit gates của monorepo, 5 spec E2E mục tiêu (port override `8100..8105`), `pnpm design:compare --screens s-vocab,s-practice-vocabulary --side app --force`, kiểm tra 4 viewport Light/Dark + keyboard focus, chụp ảnh POT và cập nhật `DESIGN.md`.

## Files to Create / Modify
- Modify: `DESIGN.md`
- Create: `plans/reports/<issueNumber>-student-vocab-desktop-1440x900-light.png`
- Create: `plans/reports/<issueNumber>-student-vocab-desktop-1440x900-dark.png`
- Create: `plans/reports/<issueNumber>-student-vocab-tablet-768x1024-light.png`
- Create: `plans/reports/<issueNumber>-student-vocab-mobile-375x812-light.png`

## Tasks & Steps

### Task 4.1 — Chạy toàn bộ static checks và unit tests monorepo
- **Goal:** Bảo đảm không có hồi quy lint, typecheck hay unit test trên toàn repo.
- **Target files and symbols:** Toàn bộ monorepo (`biome`, `check-types`, `test`).
- **Steps:**
  1. Chạy `pnpm exec biome check .` (nếu có lỗi format do chỉnh sửa, chạy `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`).
  2. Chạy `pnpm check-types && pnpm test`.
- **Success criteria:** Tất cả các lệnh exit 0 không có warning/skipped gate.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` exits 0.

### Task 4.2 — Chạy 5 spec E2E mục tiêu (KHÔNG chạy full E2E)
- **Goal:** Xác minh toàn bộ luồng từ vựng thật đầu-cuối trên Playwright với dữ liệu và auth thật.
- **Target files and symbols:**
  - `apps/e2e/specs/vocab-srs.spec.ts`
  - `apps/e2e/specs/vocab-hub-suggestion.spec.ts`
  - `apps/e2e/specs/vocab-library-clone.spec.ts`
  - `apps/e2e/specs/vocab-teacher-deck-clone.spec.ts`
  - `apps/e2e/specs/student-practice.spec.ts`
- **Steps:**
  1. Kiểm tra các cổng 8100–8105 đang trống.
  2. Chạy đúng 5 spec mục tiêu với port override:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/vocab-srs.spec.ts specs/vocab-hub-suggestion.spec.ts specs/vocab-library-clone.spec.ts specs/vocab-teacher-deck-clone.spec.ts specs/student-practice.spec.ts`
- **Success criteria:** Toàn bộ test cases trong 5 spec pass 100%, 0 assertion bị nới lỏng.
- **Verify:** Lệnh E2E 5 spec ở trên exits 0.

### Task 4.3 — Chạy `design:compare`, verify 4 viewport Light/Dark & chụp ảnh POT
- **Goal:** Kiểm chứng hình ảnh qua `design:compare`, kiểm tra 320px reflow + Light/Dark + keyboard focus + URL filter reload, và chụp 4 ảnh POT lưu vào `plans/reports/`.
- **Target files and symbols:**
  - `scripts/design-compare/capture.mjs`
  - `plans/reports/<issueNumber>-student-vocab-*.png`
- **Steps:**
  1. Chạy `pnpm design:compare --screens s-vocab,s-practice-vocabulary --side app --force` (kiểm chứng shell/route không lỗi trắng trang trên `design-seed.ts`; lưu ý `design-seed.ts` chưa seed dữ liệu `vocab_*` nên bước này chủ yếu verify empty state, không sửa `design-seed.ts` để giữ ổn định `s-dashboard` của harness chung).
  2. Khởi chạy stack E2E tạm trên các port rảnh (`boot:api` + `vite preview`/`serve-lms`), seed trực tiếp vào `local.db` bộ dữ liệu học viên đầy đủ cho `/student/practice/vocabulary`: ≥ 3 bộ từ (có due, new, và đã thuộc hết), thẻ ở cả 5 cấp trí nhớ, 7 ngày `vocab_review_log`, gợi ý `pending`, và dùng sẵn `vocab_library_*` đã seed bởi `boot` (0 dữ liệu thật/secret).
  3. Dùng Playwright kiểm tra `/student/practice/vocabulary` với dữ liệu đầy đủ ở trên:
     - 4 viewport (`1440×900`, `768×1024`, `375×812`, `320×640`) có `scrollWidth <= clientWidth` ở cả Light và Dark.
     - Kiểm tra contrast thực tế, keyboard `Tab` đi qua Hero CTA, 5 nút cấp trí nhớ, ô search, 4 nút lọc, các card bộ từ (không double focus ring), và Thư viện CTA; `Enter`/`Space` hoạt động; reload giữ nguyên `?f=&lv=&q=`.
     - Chụp 4 ảnh POT (`desktop-1440x900-light`, `desktop-1440x900-dark`, `tablet-768x1024-light`, `mobile-375x812-light`) vào `plans/reports/`.
  4. Dừng sạch toàn bộ process tạm đã mở cho việc chụp ảnh, kiểm tra `ss -ltnp` / `ps` không còn orphan.
- **Success criteria:** `design:compare` exit 0, 4 ảnh POT sạch rõ nét nằm trong `plans/reports/`, 0 horizontal overflow tại 320px/375px/768px/1440px ở cả 2 theme.
- **Verify:** `pnpm design:compare --screens s-vocab,s-practice-vocabulary --side app --force` exits 0 và 4 file ảnh PNG tồn tại với kích thước > 0 bytes.

### Task 4.4 — Cập nhật `DESIGN.md`
- **Goal:** Ghi nhận quy ước UI trang `/practice/vocabulary` và các quyết định thiết kế có chủ đích (all-time `"tỉ lệ nhớ"`, điều hướng SRS thật, không fake modal/undo, token `--vocab-lv-1..5`, single-PR `.strict()` trade-off).
- **Target files and symbols:**
  - `DESIGN.md`
- **Steps:**
  1. Đọc `DESIGN.md` đoạn liên quan (`Quy tắc component` / `Chi tiết lớp học viên`).
  2. Bổ sung mục ngắn gọn `"Trang Từ vựng học viên (/practice/vocabulary)"` mô tả layout 5 phần, 5 token `--vocab-lv-1..5` (Light + Dark), URL search sync `?f=&lv=&q=`, và các lệch có chủ đích so với `open-design/vocabulary.html`.
- **Success criteria:** `DESIGN.md` phản ánh đúng code thực tế, không chứa claim sai lệch.
- **Verify:** `pnpm exec biome check .` exits 0 (hoặc kiểm tra markdown link/số liệu trong `DESIGN.md` khớp source).

## Verification
- `pnpm exec biome check . && pnpm check-types && pnpm test` và 5 spec E2E + `design:compare` exit 0.

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
