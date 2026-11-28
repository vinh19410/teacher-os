---
title: "Phase 3: Verification, Targeted E2E & POT"
status: done
---

# Phase 3: Verification, Targeted E2E & POT

## Goal

Kiểm tra chất lượng code (review, Biome lint, TypeScript, toàn bộ unit test các workspace ảnh hưởng gồm cả `lms`), chạy 2 spec E2E liên quan với `E2E_LMS_PORT=8101`, kiểm chứng giao diện Light + Dark ở 3 viewport (`1440×900`, `768×1024`, `375×812`) trên cả `/student/tuition/$invoiceId` (unpaid + settled) và `/student/tuition`, chụp ảnh POT và ship beta PR lên `develop`.

## Files to Create or Modify

- Create: `plans/reports/<issue>-student-tuition-invoice-{light,dark}-{1440,768,375}.png` (6 ảnh `/student/tuition/$invoiceId` unpaid/no-bank-link)
- Create: `plans/reports/<issue>-student-tuition-list-{light,dark}-1440.png` (2 ảnh `/student/tuition` cho `TuitionList`)
- Create: `plans/reports/<issue>-student-tuition-paid-{light,dark}-1440.png` (2 ảnh `/student/tuition/$invoiceId` đã thanh toán `0đ`)
- Modify (nếu phát hiện finding khi review): các file trong scope Phase 1 & Phase 2

## Tasks & Steps

### Task 3.1 — Code review cục bộ & cổng kiểm tra tĩnh/unit
- **Goal:** Bảo đảm không còn finding Critical/Important, sạch Biome, sạch TypeScript, và 100% unit test liên quan pass.
- **Target files and symbols:** Toàn bộ diff trên nhánh `vinh19410/fix-student-tuition-invoice`.
- **Steps:**
  1. Chạy `code-reviewer` subagent trên `git diff`; sửa toàn bộ finding Critical/Important (và Minor hợp lý).
  2. Chạy `pnpm check` (hoặc `pnpm check:fix` rồi `pnpm check`), `pnpm check-types`, và unit tests của `@teacher-os/ui`, `student`, `web`, `lms`, `server`.
- **Success criteria:** Review verdict sạch Critical/Important; `pnpm check`, `pnpm check-types`, và toàn bộ unit test pass.
- **Verify:** `pnpm check && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter student test && pnpm --filter web test && pnpm --filter lms test && pnpm --filter server test` exits 0.

### Task 3.2 — Chạy 2 spec E2E mục tiêu & kiểm chứng thị giác 3 viewport Light/Dark
- **Goal:** Xác nhận luồng thông báo → trang chi tiết hóa đơn + SePay QR hoạt động end-to-end và thu ảnh POT 3 viewport Light/Dark cho mọi màn/trạng thái đã sửa.
- **Target files and symbols:**
  - `apps/e2e/specs/notifications-ac-001.spec.ts`
  - `apps/e2e/specs/tuition-bank-transfer.spec.ts`
  - `plans/reports/<issue>-student-tuition-*.png`
- **Steps:**
  1. Kiểm tra cổng `8100`, `8101`, `8105` trống rồi chạy:
     `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/notifications-ac-001.spec.ts specs/tuition-bank-transfer.spec.ts`
  2. Chạy regression `pnpm design:compare -- --screens pay,t-invoice` nếu môi trường truy cập được `design-v2` (ghi nhận rõ nếu offline/bỏ qua, vì `screens.json` chưa có route `/student/tuition*`).
  3. Chụp 10 ảnh POT (dùng dữ liệu seed E2E, không PII/secrets) vào `plans/reports/`:
     - `/student/tuition/$invoiceId` (unpaid, chưa link bank): Light + Dark × `1440×900`, `768×1024`, `375×812` (6 ảnh).
     - `/student/tuition` (`TuitionList`): Light + Dark × `1440×900` (2 ảnh).
     - `/student/tuition/$invoiceId` (manual `status="paid"`, `0đ`): Light + Dark × `1440×900` (2 ảnh).
     Đọc toàn bộ ảnh bằng `read_file` để kiểm contrast & layout, rồi dọn sạch mọi process/file tạm.
- **Success criteria:** 2 spec E2E pass 100%; toàn bộ ảnh POT rõ chữ ở Light & Dark, không tràn/che khuất, không còn process orphan.
- **Verify:** Lệnh E2E mục tiêu exits 0; 10 file PNG tồn tại dưới `plans/reports/` và đã kiểm trực quan.

### Task 3.3 — Ship Beta PR, Review/Fix/Reply, Merge & Watch Staging CI + Đăng POT
- **Goal:** Đưa bản sửa lên `develop`, hội tụ CI/deploy staging xanh, đóng plan index và đăng comment POT theo commit SHA sau merge lên GitHub issue.
- **Target files and symbols:** GitHub issue `#<issue>`, beta PR vào `develop`, `plans/261128-1049-fix-student-tuition-invoice/plan.md`.
- **Steps:**
  1. Đồng bộ `origin/develop`, cập nhật `plan.md` / phase statuses thành `completed` (`ak plan update --status completed`) khi toàn bộ code + review + gate cục bộ + ảnh POT đã xong, commit và push nhánh `vinh19410/fix-student-tuition-invoice`.
  2. Tạo PR vào `develop` kèm `Closes #<issue>` và tóm tắt tiếng Việt; chạy `/ak-review-pr <pr> --fix --reply --advice` (nếu có commit sửa thêm thì cập nhật commit trước merge); sau khi review xong và PR checks xanh, chạy cổng post-PR `kongming` và đăng comment lên PR + issue; gắn nhãn `ready to ship beta` và gỡ `in progress`.
  3. Merge PR vào `develop`, lấy SHA commit thực tế trên `develop` (`gh pr view <pr> --json mergeCommit` hoặc `git ls-remote origin develop`) để đảm bảo permalink ảnh không gãy khi xóa branch, theo dõi CI + `deploy-staging.yml` tới xanh, đóng plan trong local store (`ak plan close` — không đụng working tree git), và đăng comment POT theo SHA trên `develop` lên issue `#<issue>` rồi kiểm lại bằng `gh issue view <issue> --comments`.
- **Success criteria:** PR merged vào `develop`, CI & staging deploy xanh, POT comment + ảnh verified trên issue bằng SHA tồn tại trên `develop`.
- **Verify:** `gh run list --branch develop --limit 3` cho thấy workflow của merge commit `completed` / `success`; `gh issue view <issue> --comments` hiển thị đủ POT và ảnh hợp lệ.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
