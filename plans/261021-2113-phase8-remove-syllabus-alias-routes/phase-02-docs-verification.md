---
phase: 2
title: "Docs/CHANGELOG + dọn stale + full verification"
status: done
priority: P2
effort: "0.5h"
dependencies: [1]
---

# Phase 2: Docs/CHANGELOG + dọn stale + full verification

## Goal

Docs + CHANGELOG phản ánh đúng "alias đã gỡ"; comment/title web không còn nhắc route cũ; toàn bộ gate repo xanh kể cả full e2e.

## Files to Create / Modify

- Modify: `docs/system-architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `apps/web/src/lib/repos/kernel-command.test.ts` (title only)
- Modify: `apps/web/src/lib/syllabus-import.ts` (comment only)

## Tasks & Steps

### Task 2.1 — Docs + CHANGELOG sync

- Goal: không tài liệu/changelog nào còn mô tả alias còn sống.
- Target files: `docs/system-architecture.md:50`; `CHANGELOG.md:19` (anchor mệnh đề "giữ làm alias một release").
- Steps:
  1. Sửa mệnh đề trong `docs/system-architecture.md` `; the legacy \`POST /syllabi/:id/...\` kernel paths remain as aliases for one release.` → `; the legacy \`/api/syllabi/...\` alias paths were removed in phase 8 (issue #401).`
  2. `CHANGELOG.md`: mục Unreleased (hoặc mục tương ứng convention của file — đọc cấu trúc trước khi sửa), thêm/đổi ghi chú thành: route alias `/api/syllabi/...` và `/api/classes/:id/(import-syllabus|remove-curriculum)` đã gỡ ở phase 8 (issue #401) — giữ style câu chữ hiện có của mục đó, chỉ đảo ý "giữ làm alias một release" thành "đã gỡ".
  3. `grep -rn "alias" docs/system-architecture.md docs/codebase-summary.md` — mọi match còn lại phải mô tả alias ĐÃ GỠ hoặc domain khác (domain alias của infra runbook không đụng).
- Success criteria: docs không còn mệnh đề "remain as aliases"; CHANGELOG không còn "giữ làm alias".
- Verify: `grep -n "remain as aliases" docs/system-architecture.md` exit 1 VÀ `grep -n "giữ làm alias" CHANGELOG.md` exit 1.

### Task 2.2 — Dọn stale title/comment web (không đổi behavior)

- Goal: không chuỗi nào tham chiếu route cũ ngoài ngữ cảnh "đã gỡ".
- Target files: `apps/web/src/lib/repos/kernel-command.test.ts:61`, `apps/web/src/lib/syllabus-import.ts:14`.
- Steps:
  1. Đổi tiêu đề test `"maps to /api/syllabi/:id/remove with an empty body"` → `"maps to /api/syllabus-templates/:id/remove with an empty body"` (assertion giữ nguyên — đã là path mới).
  2. Đổi comment `syllabus-import.ts:14` `POST /api/syllabi` → `POST /api/syllabus-templates`.
- Success criteria: 2 file sửa xong, assertion/body không đổi.
- Verify: `no verification needed` riêng lẻ — Covered by Task 2.3 (`pnpm check` + `pnpm --filter web test`).

### Task 2.3 — Full gates

- Goal: mọi gate repo xanh trên worktree trước khi ship.
- Target files: không đổi code trong task này.
- Steps (chạy lần lượt, dừng ở lệnh đầu tiên fail):
  1. `pnpm check`
  2. `pnpm check-types`
  3. `pnpm --filter server test`
  4. `pnpm --filter web test`
  5. `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`
- Success criteria: 5 lệnh đều exit 0.
- Verify: từng lệnh exit 0; e2e output kết thúc bằng summary pass (0 failed).

## Failure Protocol

Nếu bất kỳ Verify step nào không đạt pass condition, STOP phase này. Không tự sửa mù, không retry bừa, không lý luận quanh lỗi. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh + output đầy đủ, pass condition chưa đạt. Áp dụng counsel rồi chạy lại Verify. Nếu không spawn được `kongming`: STOP và báo user cùng bằng chứng. Không tiếp tục bằng tự suy đoán.
