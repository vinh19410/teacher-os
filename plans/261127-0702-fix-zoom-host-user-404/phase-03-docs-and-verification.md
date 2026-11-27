---
title: "Phase 3: Docs, Changelog & Full Verification"
status: done
priority: P1
---

# Phase 3: Docs, Changelog & Full Verification

## Goal
Cập nhật tài liệu vận hành (`README.md`, `docs/production-release-runbook.md`, `packages/infra/.env.example`), ghi `CHANGELOG.md` và chạy đầy đủ bộ local quality gates trước khi code review & ship beta.

## Target Files and Symbols
- `README.md` (mục `### Zoom (Server-to-Server OAuth)`)
- `docs/production-release-runbook.md` (bảng `Secret inventory`)
- `packages/infra/.env.example` (mục Zoom Server-to-Server OAuth)
- `CHANGELOG.md` (mục `## 2026-11-27` → `### Fixed`)

## Steps
1. **Task 3.1 — Cập nhật `README.md` và `docs/production-release-runbook.md`**
   - Goal: Làm rõ `ZOOM_HOST_USER` bắt buộc là email tài khoản Zoom Pro hoặc Zoom User ID, không nhập tên hiển thị và không dùng `"me"` trên S2S OAuth, và Alchemy deploy sẽ fail-loud nếu cấu hình sai.
   - Target files and symbols: `README.md` (line ~76), `docs/production-release-runbook.md` (line ~89).
   - Steps: Sửa đúng 2 vị trí mô tả `ZOOM_HOST_USER` mà không làm đổi ý các phần không liên quan.
   - Success criteria: `topology-drift.test.mjs` vẫn pass (không chạm chuỗi runbook được assert).
   - Verify: `pnpm test:topology-drift` exit 0.

2. **Task 3.2 — Cập nhật `packages/infra/.env.example` và `CHANGELOG.md`**
   - Goal: Bổ sung mẫu biến Zoom (comment) vào `.env.example` và ghi changelog tiếng Việt cho ngày 2026-11-27.
   - Target files and symbols: `packages/infra/.env.example`, `CHANGELOG.md`.
   - Steps:
     1. Thêm khối `# Zoom (Server-to-Server OAuth)` (commented) vào cuối `packages/infra/.env.example`.
     2. Thêm bullet `Fixed` vào `CHANGELOG.md` dưới `## 2026-11-27` nêu rõ số issue tracking.
   - Success criteria: Định dạng gọn, chuẩn convention repo.
   - Verify: Chờ Task 3.3.

3. **Task 3.3 — Chạy toàn bộ local gates (`check`, `check-types`, `test`)**
   - Goal: Bảo đảm format, lint, typecheck và toàn bộ test suite đều xanh trước code review & ship.
   - Target files and symbols: toàn bộ monorepo (trừ full E2E theo `AGENTS.md`).
   - Steps: Chạy `pnpm check:fix && pnpm check && pnpm check-types && pnpm test`.
   - Success criteria: Tất cả lệnh exit 0, không skip/relax assertion.
   - Verify: `pnpm check && pnpm check-types && pnpm test` exit 0.

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
