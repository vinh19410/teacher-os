---
phase: 2
title: "Phase 2: E2E Reproduction, POT Screenshots, Docs & Live Staging Verification"
status: pending
---

# Phase 2: E2E Reproduction, POT Screenshots, Docs & Live Staging Verification

## Context & Files

- **Tạo mới:**
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/apps/e2e/specs/placement-lead-org-drift.spec.ts`
  - Bộ ảnh POT trong `/root/orca/workspaces/teacher-os/Debug-entry-test/plans/reports/` (`<issue>-leads-entry-test-*.png` và `<issue>-staging-submitted-*.png`)
  - Journal kỹ thuật trong `/root/orca/workspaces/teacher-os/Debug-entry-test/plans/journals/`
- **Cập nhật:**
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/docs/production-release-runbook.md` (ghi rõ vai trò kép của `LEAD_ORG_ID` + auto-routing theo `TEACHER_EMAILS`)
  - `/root/orca/workspaces/teacher-os/Debug-entry-test/CHANGELOG.md`

## Implementation Steps

1. **E2E spec cô lập (`placement-lead-org-drift.spec.ts`):**
   - Khởi tạo Hono `buildApp` + `createAuth` cô lập trên file SQLite tạm (apply migrations) với `leadOrgId = "7772e636-0ab9-424d-bb55-b5ec66c08baa"` (chứa đề `published` + audio) và `teacherEmails = [ownerEmail]`, chặn route `${API_ORIGIN}/**` qua `context.route(...)` để chạy an toàn cùng `--fully-parallel` trên CI.
   - **Quan trọng:** Phải dùng `signUpViaUi(page, ...)` (hoặc `page.evaluate(() => fetch(...))` trong trình duyệt), KHÔNG dùng `signUpViaApi` (`page.request`) vì `page.request` bỏ qua `context.route(...)`.
   - Giáo viên `ownerEmail` đăng ký → `/placement-test` không hiện cảnh báo lệch org (`isLeadOrg: true`) dù org mới khác `7772e636-...`.
   - Học viên hoàn thành `/kiem-tra-dau-vao/` 5 kỹ năng (Listening + G&V + Reading + Writing + Speaking) → thấy `#testResultCard` và `[data-testid="email-grading-notice"]`.
   - Giáo viên vào `/leads` thấy dòng học viên + `"Chờ chấm W&S"`, kiểm tra không tràn ngang ở `1440×900`, `768×1024`, `375×812`, `320×568`, mở modal `LeadDetailModal` (`PlacementSubmissionPanel`), chấm điểm & xem kết quả công khai `/kiem-tra-dau-vao/ket-qua/?t=<token>`.
   - Khi đặt `CAPTURE_POT_ISSUE=<N>`, chụp đủ 5 ảnh POT (`/leads` 3 viewport + modal chi tiết light & dark).
2. **Chạy E2E lẻ & Gate toàn repo:**
   - Chạy `specs/placement-lead-org-drift.spec.ts specs/profile-placement-test.spec.ts specs/profile-lead-intake.spec.ts` với port override `8100..8105` (tuyệt đối không chạy full E2E ở local).
   - Chạy `pnpm check`, `pnpm exec biome check .`, `CI=1 pnpm check-types`, `CI=1 pnpm test`, `CI=1 pnpm build`.
3. **Code Review, PR Beta & Merge `develop`:**
   - Subagent `code-reviewer` review `git diff origin/develop`, sửa phát hiện nếu có.
   - Mở PR vào `develop`, thực hiện `/ak-review-pr <PR> --fix --reply`, đợi CI xanh, gắn nhãn `ready to ship beta`, merge PR vào `develop` (giữ nhánh `vinh19410/Debug-entry-test` để push ảnh POT live staging).
4. **Live Staging Verification & POT Comment:**
   - Theo dõi `CI` và `Deploy Staging` trên `develop` tới `success`.
   - Chạy Playwright script tạm từ `scratch/` nộp 1 bài Entry Test thật 5 kỹ năng lên `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/`, xác minh HTTP `201`/`200` (che tuyệt đối `uploadToken`), chụp 3 viewport live staging, push ảnh lên `vinh19410/Debug-entry-test`, và đăng comment POT hoàn chỉnh với SHA-permalink lên GitHub Issue.

## Tasks

- [ ] Viết `apps/e2e/specs/placement-lead-org-drift.spec.ts` và chụp ảnh POT `/leads` 3 viewport + dark
- [ ] Chạy 3 spec E2E lẻ + kiểm tra trực quan từng ảnh PNG
- [ ] Cập nhật `docs/production-release-runbook.md`, `CHANGELOG.md`, viết journal kỹ thuật
- [ ] Chạy `pnpm check`, `pnpm exec biome check .`, `CI=1 pnpm check-types`, `CI=1 pnpm test`, `CI=1 pnpm build` & review diff
- [ ] Tạo PR vào `develop`, review PR, merge khi CI xanh và đợi `Deploy Staging` xanh
- [ ] Nộp 1 bài Entry Test thật lên `https://profile.staging.teacheros.io.vn/kiem-tra-dau-vao/`, push ảnh 3 viewport live và đăng comment POT lên Issue

## Risk & Rollback

- **Rủi ro:** Live staging `Deploy Staging` có thể mất vài phút hoặc gặp giới hạn rate-limit IP khi test nhiều lần. Giải pháp: chạy script live staging đúng 1 lượt duy nhất sau khi `Deploy Staging` xanh, dùng SĐT/email test duy nhất (`pot.entrytest.<ts>@smoke.teacheros.internal`), không làm ảnh hưởng dữ liệu thật.
- **Rollback:** PR đã merge vào `develop` có thể `git revert` sạch sẽ vì không có D1 migration.
