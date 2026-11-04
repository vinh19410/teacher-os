---
phase: 3
title: "Phase 3: Ghi chú rollback trong runbook & cổng kiểm chứng toàn diện"
status: pending
priority: P2
effort: "1.0h"
dependencies: [1, 2]
---

# Phase 3: Ghi chú rollback trong runbook & cổng kiểm chứng toàn diện

<!-- Updated: Red Team RT-4 -->

## Goal

Cập nhật `docs/production-release-runbook.md` với hướng dẫn kiểm tra trước deploy cho `0061` và quy trình/cảnh báo rollback chính xác cho migration `0060`–`0061`, sau đó chạy trọn bộ cổng chất lượng local (`drizzle-kit check`, `biome check`, `check-types`, `test`).

## Files to Create / Modify

- Modify:
  - `docs/production-release-runbook.md`

## Tasks & Steps

### Task 3.1 — Bổ sung mục hướng dẫn deploy & rollback Study Pack (`0060`–`0061`) vào runbook
- **Goal:** Ghi nhận đầy đủ cổng kiểm tra pre-flight chống trùng `(org_id, source_pack_id)` trước khi auto-deploy `0061`, và cảnh báo chính xác về rủi ro lộ bài sớm / lệch schema khi rollback Worker qua ranh giới `0060`–`0061` vào `docs/production-release-runbook.md`.
- **Target files and symbols:**
  - `docs/production-release-runbook.md` (thêm mục mới ở cuối file sau mục `### Kiểm domain custom`, dòng 927–933)
- **Steps:** <!-- Updated: Red Team RT-4 - sửa đúng cơ chế PROBE_QUERY của apps/server/src/routes/readiness.ts, cấm DROP INDEX, dùng UPDATE source_pack_id = NULL tránh ON DELETE restrict -->
  1. Đọc phần cuối `docs/production-release-runbook.md` (dòng 910–933) để giữ đúng giọng văn, cấu trúc markdown và quy ước tiếng Việt của runbook.
  2. Thêm mục `## Bộ đề tự học theo lịch (migrations 0060–0061) — issue #533/#554` bao gồm 4 ý cốt lõi:
     - **Pre-flight bắt buộc TRƯỚC khi merge/push `0061` lên `staging` hoặc `main` (`study_pack_org_source_pack_uq`):** Vì `.github/workflows/deploy-staging.yml` và `deploy.yml` tự động chạy `alchemy deploy` áp migration ngay khi push, bắt buộc chạy trước truy vấn đọc trên D1:
       `SELECT org_id, source_pack_id, COUNT(*) AS cnt FROM study_pack WHERE source_pack_id IS NOT NULL GROUP BY org_id, source_pack_id HAVING COUNT(*) > 1;`
       Kết quả phải trả `0` dòng. Nếu phát hiện bản ghi trùng (đặc biệt khi bản dư đã từng gán vào lớp nên bị `class_study_pack.pack_id` khóa `ON DELETE restrict`), giữ lại 1 bản chính và tách liên kết các bản dư một cách an toàn bằng `UPDATE study_pack SET source_pack_id = NULL WHERE id = '<duplicate_pack_id>';` (không xóa dữ liệu lịch sử lớp học).
     - **Tính chất forward-only của `0060_study_pack.sql` và cảnh báo KHÔNG revert riêng Worker về trước `#533` (`0060`):**
       1. *Lộ sớm bài chưa đến giờ mở cho học viên:* Code Worker trước `0060` không có `visibleAssignmentFilter(now)` (`available_at IS NULL OR available_at <= now` tại `apps/server/src/lib/assignment-visibility.ts`) cũng như kiểm tra `available_at` trong `loadOwnedAttemptWithSkill` (`apps/server/src/routes/student.ts`), nên nếu code cũ đọc vào dữ liệu `0060`, mọi dòng `class_assignment` có `available_at > now` sẽ hiển thị và làm/nộp bài được sớm trên cổng học viên.
       2. *Rò rỉ vào snapshot giáo viên & trần 200 bài:* Code cũ không lọc `class_study_pack_id IS NULL` trong `loadSnapshot` (`apps/server/src/routes/snapshot.ts`) và `POST /api/classes/:id/assignments` (`apps/server/src/routes/kernel.ts`), cũng không lọc `library_ref IS NULL` trên `assignment_prompt`, làm bài tự học tràn vào danh sách bài tập thủ công và ngân hàng đề.
       3. *Không tương thích `/readyz` (`503`) và cột đã xóa:* `0060` đã `DROP COLUMN plan_item_id` và `DROP TABLE self_study_plan*` đồng thời thêm 3 cột mới; `apps/server/src/routes/readiness.ts` kiểm tra đủ `REQUIRED_OBJECTS` của bundle và khớp tổng cột `REQUIRED_COLUMN_TOTAL`, nên revert riêng Worker về trước `0060` sẽ làm `/readyz` trả `503 {"ok":false}`.
     - **Tương thích ngược của `0061` (`study_pack_org_source_pack_uq`):**
       - `0061` chỉ thêm 1 unique index mới, không thêm/bớt cột hay bảng. Vì `PROBE_QUERY` trong `apps/server/src/routes/readiness.ts` chỉ đếm các tên nằm trong `REQUIRED_OBJECTS` của chính bundle Worker đang chạy (`name IN (SELECT value FROM json_each(...))`), việc lùi Worker từ bản `#554` (`0061`) về bản `#533` (`0060`) vẫn giữ `/readyz` trả `200 {"ok":true}`. **Tuyệt đối KHÔNG chạy `DROP INDEX study_pack_org_source_pack_uq`** trên D1 (vì sổ cái migration D1 đã ghi nhận `0061`, xóa index tay sẽ làm lần deploy kế tiếp thiếu index và sập `/readyz` `503`).
     - **Hướng xử lý sự cố / Rollback an toàn:**
       - Ưu tiên **forward-fix** trên nhánh `>= 0060` (hoặc hủy các `class_study_pack` đang chạy qua API/UI nếu cần thu hồi các bài chưa đến giờ mở).
       - Nếu bắt buộc khôi phục hoàn toàn về trước `#533` (`0060`), phải khôi phục đồng bộ D1 bằng **D1 Time Travel** về đúng bookmark trước khi chạy `0060` cùng lúc với việc lùi Worker/frontend.
- **Success criteria:** `docs/production-release-runbook.md` chứa đầy đủ cảnh báo `class_study_pack_id`, `available_at`, cơ chế chính xác của `apps/server/src/routes/readiness.ts`, câu SQL pre-flight `0061` (`UPDATE ... SET source_pack_id = NULL`), và hướng xử lý rollback; script kiểm tra drift của runbook chạy xanh.
- **Verify:** `pnpm test:topology-drift && pnpm exec biome check .` thoát `0`.

### Task 3.2 — Chạy cổng kiểm chứng toàn diện của repository
- **Goal:** Xác minh toàn bộ workspace pass lint/format, typecheck, kiểm tra tính toàn vẹn migration Drizzle và toàn bộ test suite theo đúng yêu cầu của `AGENTS.md`.
- **Target files and symbols:**
  - Toàn bộ workspace tại `/root/projects/worktrees/teacher-os-554-study-pack-followup`
- **Steps:** <!-- Updated: Red Team RT-4 - dùng pnpm check:fix khi cần ghi sửa format -->
  1. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit check`.
  2. Chạy `pnpm exec biome check .` (nếu có lỗi format trên các file do nhánh này chạm tới, chạy `pnpm check:fix` rồi kiểm lại bằng `pnpm exec biome check .`).
  3. Chạy `pnpm check-types`.
  4. Chạy `pnpm test`.
- **Success criteria:** Cả 4 lệnh đều thoát `0` không có lỗi.
- **Verify:** `pnpm --filter @teacher-os/db exec drizzle-kit check && pnpm exec biome check . && pnpm check-types && pnpm test` thoát `0`.

## Todo

- [x] Task 3.1 — Bổ sung mục hướng dẫn deploy & rollback Study Pack (`0060`–`0061`) vào runbook
- [x] Task 3.2 — Chạy cổng kiểm chứng toàn diện của repository

## Success Criteria

- `docs/production-release-runbook.md` có đầy đủ hướng dẫn rollback & pre-deploy check chính xác cho `0060`–`0061`.
- `drizzle-kit check`, `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test` đều thoát `0`.

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
