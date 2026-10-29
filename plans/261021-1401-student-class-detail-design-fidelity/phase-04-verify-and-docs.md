---
phase: 4
title: "Test, e2e, so ảnh, DESIGN.md"
status: completed
effort: "1h"
dependencies: [2, 3]
---

# Phase 4: Kiểm chứng và tài liệu

<!-- Updated: Validation & Red Team Session 1 - Handover task decomposition + Failure Protocol -->

## Goal

Kiểm chứng toàn diện (lint/format, typecheck, unit test, E2E, ảnh chụp đối chiếu `pnpm design:compare` ở 3 viewport × 2 theme) và cập nhật `DESIGN.md` + `verdict.md`.

## Files

- Modify: `DESIGN.md`
- Modify: `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`
- Modify (regenerated screenshots): `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/*.png`

## Tasks

### Task 4.1 — Cập nhật `DESIGN.md` và `verdict.md`
- **Goal:** Ghi nhận đầy đủ các mục lệch có chủ đích của màn `s-class-detail` (do backend chưa trả dữ liệu hoặc giữ hợp đồng E2E) vào `DESIGN.md` và `verdict.md`.
- **Target files and symbols:**
  - `DESIGN.md`
  - `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`
- **Steps:**
  1. Trong `DESIGN.md`, thêm mục ghi chú lệch có chủ đích của trang chi tiết lớp học viên (`/classes/$classId`): giữ nhãn/đích Back link `"← Trang chủ"` (`/`) theo hợp đồng điều hướng E2E; ẩn các khối server chưa có dữ liệu (bài về nhà theo buổi, địa điểm/phòng, học phí theo lớp, tham gia từ buổi, cột Skill của bài tập, nhóm module và nhãn Mid/Final test trong giáo trình, target band của bạn cùng lớp theo quyền riêng #378, link lớp online); Ring "Band trung bình" hiện `"—"` khi endpoint lớp trả `scores: null`.
  2. Trong `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`, cập nhật 6 dòng `s-class-detail` với ghi chú rõ các khối khớp design v2 và các khối ẩn vì chưa có dữ liệu server.
- **Success criteria:** `DESIGN.md` và `verdict.md` phản ánh chính xác trạng thái màn `s-class-detail`.
- **Verify:** no verification needed (kiểm chứng ở Task 4.2).

### Task 4.2 — Chạy `pnpm check`, `pnpm check-types`, và unit tests
- **Goal:** Đảm bảo không có lỗi Biome format/lint, lỗi TypeScript, hoặc lỗi unit test, và không còn class dead/xung đột trong các file đụng tới.
- **Target files and symbols:**
  - Toàn bộ workspace (`apps/student`, `packages/*`)
- **Steps:**
  1. Chạy `pnpm check && pnpm check-types && pnpm --filter student test`.
  2. Kiểm tra không còn `stroke-surface`, `stroke-hot`, `rounded-lg rounded-xl`, `rounded-full rounded-md` trong `apps/student/src/components/class/`.
- **Success criteria:** Các lệnh exit 0, toàn bộ unit test xanh.
- **Verify:** `pnpm check && pnpm check-types && pnpm --filter student test` exits 0.

### Task 4.3 — Chụp lại ảnh đối chiếu `s-class-detail` bằng `pnpm design:compare`
- **Goal:** Cập nhật 6 ảnh ghép side-by-side (`desktop`/`tablet`/`phone` × `light`/`dark`) của `s-class-detail`.
- **Target files and symbols:**
  - `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/*.png`
- **Steps:**
  1. Xoá file ảnh cũ của `s-class-detail` trong `scripts/design-compare/.state/raw/new/s-class-detail` và `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/*.png` để `capture.mjs` không skip.
  2. Chạy `node scripts/design-compare/capture.mjs --screens s-class-detail --side both --label new`.
  3. Kiểm tra trực quan ảnh chụp ở 3 viewport × 2 theme (1440×900, 768×1024, 375×812) đảm bảo không tràn ngang, đúng token light/dark.
- **Success criteria:** Lệnh `capture.mjs` exit 0 và tạo đủ 6 ảnh mới trong `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/`.
- **Verify:** `node scripts/design-compare/capture.mjs --screens s-class-detail --side both --label new` exits 0 and prints `0 lỗi`.

### Task 4.4 — Chạy E2E specs liên quan và full Playwright suite
- **Goal:** Đảm bảo `student-class-detail.spec.ts`, `student-classmates.spec.ts`, `student-practice.spec.ts` và toàn bộ bộ test E2E đều xanh trên cổng 8100/8101/8103.
- **Target files and symbols:**
  - `apps/e2e/specs/student-class-detail.spec.ts`
  - `apps/e2e/specs/student-classmates.spec.ts`
  - `apps/e2e/specs/student-practice.spec.ts`
- **Steps:**
  1. Chạy `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-class-detail student-classmates student-practice`.
  2. Chạy full Playwright suite trước khi merge vào `develop`: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- **Success criteria:** Toàn bộ E2E specs pass.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-class-detail student-classmates student-practice` exits 0.

## Rollback

Mỗi phase một phạm vi rõ ràng; hoàn tác bằng `git revert`. Không có migration, không đổi API.

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
