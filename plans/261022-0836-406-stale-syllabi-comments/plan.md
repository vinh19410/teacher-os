---
title: "Dọn 3 comment tham chiếu route /syllabi đã gỡ (issue #406)"
description: "Sửa 3 comment lịch sử còn trỏ route alias /syllabi đã gỡ ở phase 8 (#401, PR #405) sang route thay thế POST /api/syllabus-templates. Thuần comment, không đổi behavior."
status: completed
priority: P3
effort: 15m
issue: 406
branch: fix/406-stale-syllabi-comments
tags: [bugfix, comment-cleanup, no-behavior-change]
blockedBy: []
blocks: []
created: 2026-10-22
---

# Plan: Dọn comment /syllabi chết (issue #406)

## Overview

Follow-up của #401 (PR #405): alias routes `/api/syllabi/...` đã gỡ hẳn ở phase 8, nhưng
3 comment vẫn trỏ route chết như thể nó còn sống (người đọc sẽ tìm một route không tồn tại):

| File:line | Comment cũ | Vấn đề |
|---|---|---|
| `packages/api/src/contracts.ts:1133` | `* consistent with POST /syllabi.` | Trỏ route tạo syllabus đã gỡ |
| `apps/server/src/routes/kernel.ts:1082` | `// Issue #60 — creation is non-idempotent, consistent with POST /syllabi.` | Như trên |
| `apps/server/src/routes/student.ts:363` | `// Content-Length không lọt) — precedent kernel.ts /syllabi.` | Trỏ precedent bodyLimit ở kernel.ts route đã gỡ |

Root cause (đã chứng minh bằng grep + git archaeology):

1. Commit `140d5725` (PR #405, #401) gỡ alias routes `/api/syllabi`, `/api/syllabi/:id/*`,
   `/api/classes/:id/{import-syllabus,remove-curriculum}` — xác nhận bằng toàn bộ test
   404 regression trong `apps/server/src/kernel.test.ts:3693-3707`.
2. Route thay thế tạo syllabus (template): `POST /api/syllabus-templates` — khai báo tại
   `apps/server/src/routes/syllabus.ts:411`, mount prefix `/api` (docs/system-architecture.md:49-50).
3. Precedent pattern bodyLimit đo byte thật (middleware call `(c, next)`, onError 413
   "payload too large") mà `student.ts:363` trỏ tới hiện sống ở handler
   `POST /api/syllabus-templates` (`apps/server/src/routes/syllabus.ts:417-421`, cap 2 MiB).

PR #405 cố tình không nhét vào để giữ diff tối thiểu (counsel kongming của #405).

## Fix

Sửa thuần text comment, giữ nguyên vẹn mọi ký tự khác:

1. `contracts.ts:1133`: `consistent with POST /syllabi.` → `consistent with POST /api/syllabus-templates.`
2. `kernel.ts:1082`: `consistent with POST /syllabi.` → `consistent with POST /api/syllabus-templates.`
3. `student.ts:363`: `precedent kernel.ts /syllabi.` → `precedent POST /api/syllabus-templates (syllabus.ts).`

## Non-goals

- Không đổi bất kỳ behavior, code, test, route, contract nào — chỉ 3 dòng comment.
- Không đụng các tham chiếu `/syllabi` KHÁC vẫn hợp lệ: CHANGELOG.md (bản ghi lịch sử về
  việc gỡ route), `kernel.test.ts:3693-3707` (test regression 404 cho route đã gỡ),
  `syllabus.ts:409` + `syllabus-content-routes.ts:35` (comment lịch sử mô tả việc gỡ alias),
  `docs/system-architecture.md:50` (doc ghi nhận alias đã gỡ), `plans/**` (artifact lịch sử).
- Không đụng `main`. Merge target duy nhất: `develop` (ship mode beta).

## Phases

1. `phase-01-update-stale-comments.md` — sửa 3 comment, verify grep + check + test suite.

## Acceptance criteria

- [x] `grep -rn "POST /syllabi\b" packages/api/src apps/server/src` → 0 hit (đã verify;
      tham chiếu lịch sử `/syllabi` trong CHANGELOG (2 hit, không đổi)/doc/test giữ nguyên).
- [x] `git diff` chỉ chứa đúng 3 file, đúng 3 dòng comment, 0 dòng code khác (scope guard
      before/after từng lệnh verify).
- [x] Gate lint: `pnpm check` toàn-repo **đỏ pre-existing** trên develop `c5cfe9d4`
      (plans/reports/brainstorm HTML từ #400 — follow-up #409); gate thay thế theo counsel
      kongming: `biome check` scoped 3 file diff exit 0 (1 warning pre-existing student.ts:340).
- [x] `pnpm check-types` exit 0.
- [x] `pnpm --filter server test` exit 0 (52 files, 738 tests passed).

## Scope lockdown (Advisor)

- Đúng 3 file: `packages/api/src/contracts.ts`, `apps/server/src/routes/kernel.ts`,
  `apps/server/src/routes/student.ts`. Mỗi file đúng 1 dòng.
- Không tạo/sửa test (không observable behavior). Không đụng docs (comment nội bộ, không
  contract công khai). Merge vào `develop`, không bao giờ `main`.

## Validation Log

- `ak plan validate plans/261022-0836-406-stale-syllabi-comments` → `[OK] … is a valid
  plan directory` (format gate, 2026-10-22).
- Verification pass (controller): 3 vị trí comment chết grep khớp đúng dòng; route thay thế
  `POST /api/syllabus-templates` xác nhận tại `syllabus.ts:411` + bodyLimit `:417-421`;
  commit gỡ alias `140d5725` (PR #405) xác nhận bằng git log. Failed: 0.

## Red Team Review

Kongming advisory gate (checkpoint sau investigation + plan gates, 2026-10-22) — tự xác minh
trực tiếp trên worktree (mount path `kernel.ts:1232`, `app.ts:241`, bodyLimit semantics,
toàn bộ tham chiếu lịch sử). Verdict: **GO**.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Note | `kernel.ts:1082`/`contracts.ts:1133` không cần thêm "(syllabus.ts)" — giữ 2 biểu thức song song, chỉ `student.ts` cần tên file vì trỏ precedent cụ thể | **Accept** — làm đúng theo plan gốc |
| 2 | Note | `student.ts:363` sửa thành "precedent POST /api/syllabus-templates (syllabus.ts)" chính xác hơn comment cũ (cũ sai file "kernel.ts" từ sau phase peel); bodyLimit ở syllabus.ts là middleware trước handler còn student.ts gọi inline — cùng thư viện, cùng semantics đo byte thật, gọi precedent là công bằng | **Accept** — wording giữ nguyên |
| 3 | Low | Rủi ro hồi quy bằng không: thuần comment, không string literal, không golden file snapshot 3 dòng này; rủi ro duy nhất là typo → verify grep chặn | Không cần hành động |
| 4 | Low | Merge-conflict nóng nếu develop có PR song song land vào 3 file này trong cửa sổ ship | Rebase trước ship nếu CI báo |

Không còn mâu thuẫn chưa giải quyết. Không có accepted finding nào đòi sửa plan.
