---
title: "Phase 8: Gỡ route alias deprecated (sau một release)"
status: todo
---

# Phase 8: Gỡ route alias deprecated (sau một release)

## Goal

Xoá các route cũ `/syllabi/:id/...`, `/classes/:id/import-syllabus` và `/classes/:id/remove-curriculum` sau khi web mới đã chạy trên prod đủ một release.

## Precondition (BẮT BUỘC, kiểm trước khi làm bất cứ thứ gì)

1. PR 3a và 3b (web) đã deploy lên prod và đã qua ít nhất một release.
2. User xác nhận bằng văn bản (trong chat) rằng không còn client nào gọi route cũ. Câu hỏi mở số 2 của `plan.md`.

Nếu thiếu một trong hai: STOP và hỏi user. Không tự suy đoán.

## Context

- Route `GET /syllabi` (đọc snapshot syllabus) **không** phải alias; giữ nguyên.
- Test server đã được chuyển sang route mới ở phase 4 Task 4.4; chỉ còn test bảo vệ alias cần xoá.
- Bảng ánh xạ (nguồn: [design-decisions.md](./reports/design-decisions.md) D6) và quy tắc chọn đường mới theo loại `id`: khi `id` là template dùng `/syllabus-templates/${id}/...`; khi `id` là bản copy của lớp dùng `/classes/${classId}/curriculum/...`.

## Files

- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/kernel.test.ts`
- Modify: bất kỳ file nào khác `rg` ở Task 8.1 tìm thấy

## Tasks

### Task 8.1: Liệt kê người gọi route cũ

- **Steps:** `rg -n "/api/syllabi|import-syllabus|remove-curriculum" apps packages docs --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!plans/**'` và ghi danh sách theo file.
- **Success criteria:** biết chính xác file nào còn dùng route cũ.
- **Verify:** no verification needed (liệt kê).

### Task 8.2: Xoá test bảo vệ alias

- **Target files:** `apps/server/src/kernel.test.ts`.
- **Steps:** xoá test bảo vệ alias (phase 4 Task 4.3 bước 7) và các assert alias `replace-content`/`remove` trên bản copy (Task 4.3 bước 5). Không đổi `GET /api/syllabi`.
- **Success criteria:** test không còn gọi route cũ.
- **Verify:** `rg -n "/api/syllabi/|/import-syllabus|/remove-curriculum" apps/server/src/kernel.test.ts` prints nothing (exit code 1) and `pnpm --filter server test` exits 0 with `0 failed`.

### Task 8.3: Xoá alias

- **Target files:** `apps/server/src/routes/syllabus.ts`.
- **Steps:**
  1. Xoá lệnh mount `mountContentRoutes` với `basePath: "/syllabi/:id"`.
  2. Xoá các đăng ký cũ: `POST /syllabi` (và middleware bodyLimit của nó), `/syllabi/:id/replace-content`, `/syllabi/:id/remove`, `/classes/:id/import-syllabus`, `/classes/:id/remove-curriculum`. Giữ `GET /syllabi`.
  3. Xoá biến hay import chết.
  4. Chạy `pnpm exec biome check apps packages`.
- **Success criteria:** chỉ còn `GET /syllabi` dưới tiền tố `/syllabi`.
- **Verify:** `rg -n '"/syllabi' apps/server/src/routes` prints exactly one registration line (`GET "/syllabi"`); `pnpm --filter server test` exits 0 with `0 failed`; `pnpm check-types` exits 0.

### Task 8.4: Full e2e và PR

- **Steps:** chạy Task 7.4 (cả sáu bước) rồi mở PR 4 theo Task 7.5.
- **Success criteria:** full e2e xanh.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` exits 0 with no failed tests.

## Success Criteria

- [ ] Không còn route cũ; `GET /syllabi` vẫn chạy.
- [ ] `rg -n "/api/syllabi/|/import-syllabus|/remove-curriculum" apps packages docs --glob '!plans/**'` không còn khớp.
- [ ] Test và full e2e xanh.

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
