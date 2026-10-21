---
title: "Phase 7: E2E và verify toàn bộ"
status: todo
---

# Phase 7: E2E và verify toàn bộ

## Goal

Chứng minh luồng tạo template, tạo lớp kèm template, gán sau, sửa giáo trình của lớp và gỡ chạy đúng end to end; cập nhật e2e và docs theo route mới; mở các PR theo kế hoạch giao hàng.

## Context

- CI/E2E chỉ chạy cho PR vào `main`; PR vào `develop` không có checks, nên cổng là lệnh local (AGENTS.md). Stack dev local chiếm cổng 8000/8001/8003 nên e2e dùng `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.
- Trước khi squash-merge vào `develop` phải chạy **full** Playwright; nếu `develop` đã tiến thêm thì merge `develop` vào nhánh rồi chạy lại full (ghi nhớ của repo).
- E2E dùng route cũ để seed dữ liệu: `apps/e2e/specs/syllabus-delete-reorder.spec.ts` gọi `/api/syllabi` và `/api/syllabi/${id}/modules...` (dòng ~31-70). Alias cũ còn chạy ở phase này nhưng cần chuyển sang route mới để phase 8 không làm gãy.
- Docs nhắc route cũ: `docs/system-architecture.md:49` và `docs/codebase-summary.md:45` (đang trỏ `POST /api/syllabi/:id/replace-content` và file `kernel.ts`).

## Files

- Modify: `apps/e2e/specs/syllabus-delete-reorder.spec.ts` (và các spec/helper khác nếu `rg` ở Task 7.1 tìm thấy route cũ)
- Create: `apps/e2e/specs/syllabus-class-curriculum.spec.ts`
- Modify: `docs/system-architecture.md`, `docs/codebase-summary.md`

## Tasks

### Task 7.1: Chuyển seed e2e sang route mới

- **Goal:** e2e không phụ thuộc alias.
- **Target files:** mọi file `apps/e2e` khớp mẫu.
- **Steps:**
  1. `rg -n "api/syllabi|import-syllabus|remove-curriculum" apps/e2e` để lấy danh sách.
  2. Đổi theo bảng: `/api/syllabi` → `/api/syllabus-templates`; `/api/syllabi/${id}/(modules|replace-content|remove)...` → `/api/syllabus-templates/${id}/...` khi `id` là template; khi `id` là bản copy của lớp → `/api/classes/${classId}/curriculum/...`; `/api/classes/${id}/import-syllabus` → `/api/classes/${id}/curriculum/import`; `/api/classes/${id}/remove-curriculum` → `/api/classes/${id}/curriculum/remove`.
- **Success criteria:** `apps/e2e` không còn route cũ.
- **Verify:** `rg -n "api/syllabi|import-syllabus|remove-curriculum" apps/e2e` prints nothing (exit code 1); `pnpm --filter e2e check-types` exits 0.

### Task 7.2: Spec mới cho luồng chính

- **Goal:** khoá luồng người dùng của refactor.
- **Target files:** `apps/e2e/specs/syllabus-class-curriculum.spec.ts` (mẫu: đọc `apps/e2e/specs/syllabus-delete-reorder.spec.ts` và `apps/e2e/specs/class-sessions-manage-modal.spec.ts` trước, dùng cùng helper đăng nhập, `apiPost`, selector).
- **Steps:**
  1. Seed bằng API: một template có 2 module và 3 lesson (bao gồm một buổi `kind: "midterm"`).
  2. Test A "tạo lớp kèm template": mở modal tạo lớp, chọn template trong `TemplatePicker`, thấy số buổi và kỹ năng, mở "Xem nội dung" thấy tiêu đề module; tạo lớp; mở tab Giáo trình của lớp thấy tên giáo trình và nút "Gỡ giáo trình".
  3. Test B "gán sau": tạo lớp trống (không chọn template); vào tab Giáo trình, bấm "Nhập từ template", chọn template, "Nhập giáo trình"; thấy giáo trình. Bấm nhập lần hai bằng API trực tiếp → 409.
  4. Test C "sửa bản copy không đổi template": trong "Quản lý buổi" của lớp sửa tiêu đề một lesson; mở `/syllabus/<templateId>` thấy tiêu đề cũ.
  5. Test D "gỡ": bấm "Gỡ giáo trình", xác nhận; tab Giáo trình trở về trạng thái trống; `/syllabus/<templateId>` vẫn còn.
  6. Test E "id bản copy không mở như template": điều hướng tới `/syllabus/<copyId>` → trạng thái không tìm thấy.
- **Success criteria:** 5 test xanh, chạy lặp lại được (mỗi test tạo dữ liệu riêng với tiền tố ngẫu nhiên giống các spec khác).
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- syllabus-class-curriculum` exits 0 and prints `5 passed`.

### Task 7.3: Docs

- **Goal:** docs trỏ đúng route và file.
- **Target files:** `docs/system-architecture.md`, `docs/codebase-summary.md`.
- **Steps:**
  1. Đọc từng file quanh dòng đã nêu trước khi sửa.
  2. `system-architecture.md:49`: đổi `POST /api/syllabi/:id/replace-content` thành `POST /api/syllabus-templates/:id/replace-content`.
  3. `codebase-summary.md:45`: đổi endpoint như trên và đổi đường dẫn file thành `apps/server/src/routes/syllabus.ts`.
  4. Thêm vào `system-architecture.md`, một đoạn ngắn (≤ 6 dòng) mô tả mô hình: template là `syllabus.class_id IS NULL`, giáo trình của lớp là bản copy với `class_id`, `syllabus.class_id` là nguồn sự thật, `class.syllabus_id` là cột dẫn xuất chỉ ghi qua `lib/syllabus-curriculum.ts`, nhóm route `/syllabus-templates` và `/classes/:id/curriculum`.
- **Success criteria:** hai file trỏ đúng; link tương đối còn hợp lệ.
- **Verify:** `rg -n "api/syllabi" docs` prints nothing (exit code 1); `ls apps/server/src/routes/syllabus.ts` exits 0.

### Task 7.4: Toàn bộ kiểm tra local

- **Steps (chạy lần lượt, ghi kết quả vào mô tả PR):**
  1. `pnpm exec biome check apps packages`
  2. `pnpm check-types`
  3. `pnpm test`
  4. `pnpm design:compare`
  5. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` (full suite)
  6. `git fetch origin && git log --oneline HEAD..origin/develop | wc -l`: nếu khác 0, merge `origin/develop` vào nhánh và chạy lại bước 5.
- **Success criteria:** cả sáu bước xanh.
- **Verify:** mỗi lệnh exits 0; bước 5 prints `0 failed` (hoặc tương đương của Playwright: không có dòng `failed`); bước 6 prints `0` ngay trước khi merge.

### Task 7.5: PR theo kế hoạch giao hàng

- **Goal:** các PR nhỏ, merge theo thứ tự, mỗi PR đã qua full e2e.
- **Steps:**
  1. Theo bảng Delivery plan trong `plan.md`: PR 1 (phase 2), PR 2a (phase 3), PR 2b (phase 4), release R1, PR 3a (phase 5 + Task 7.1 + 7.3), PR 3b (phase 6 + Task 7.2), PR 4 (phase 8, tuỳ chọn). Mỗi PR từ nhánh riêng, đích `develop`, tiêu đề conventional commit tiếng Anh, mô tả tiếng Việt (precedent #281, #284), kèm kết quả Task 7.4 và (PR 3b) ảnh 3 viewport.
  2. Mỗi PR chạy Task 7.4 trên **chính nhánh của nó** trước khi squash-merge.
  3. Thứ tự deploy: R1 (server có route mới và alias) lên prod trước khi merge PR 3a/3b. Smoke R1 do user chạy sau deploy: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<prod-host>/api/syllabus-templates -H 'content-type: application/json' -d '{}'` phải in `401` (không phải `404`).
  4. Migration `0042` (nếu có): user áp dụng theo `reports/phase-03-deploy-notes.md` (Time Travel bookmark, staging trước, Alchemy áp migration lúc deploy theo `docs/production-release-runbook.md`) trước khi deploy R1 lên prod. Agent không chạy wrangler trên staging/prod.
  5. Dùng skill `ak-git` / `ak-ship` cho commit, push và PR; không tự viết lệnh git thủ công trừ khi skill lỗi.
- **Success criteria:** mọi PR có kết quả kiểm tra đính kèm.
- **Verify:** `gh pr list --state open --search "syllabus" --json number,title` lists the open PRs; mỗi PR body chứa chuỗi `pnpm --filter e2e e2e`.

## Success Criteria

- [ ] Full e2e xanh trên từng nhánh PR ngay trước khi merge.
- [ ] `apps/e2e` và `docs` không còn route cũ.
- [ ] Các PR theo thứ tự trong plan.md; R1 smoke trả 401; migration `0042` (nếu có) được user áp dụng theo runbook trước khi deploy server.

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
