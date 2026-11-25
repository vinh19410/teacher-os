---
phase: 1
title: "Phase 1: Reading Dataset Fix, Turbo Inputs & Integrity Tests"
status: completed
priority: P1
effort: "25m"
dependencies: []
---

# Phase 1: Reading Dataset Fix, Turbo Inputs & Integrity Tests

<!-- Updated: Red-Team Review 2026-11-25 - Clarified exact duplicated-title detection algorithm with helper self-tests, added structural content assertions for b8927676, removed phantom inline-instruction.test.ts gate, and added packages/db/turbo.json + ci-workflow.test.mjs guard -->

## Goal
Viết test toàn vẹn dữ liệu TDD cho bộ 351 bài Reading trong `docs/reading-ielts/reading-practice/`, khai báo cross-package Turbo test inputs tại `packages/db/turbo.json` (kèm guard ở `scripts/ci-workflow.test.mjs`), rồi đổi tên file (`git mv`) và sửa tiêu đề bị lặp đôi của bài `b8927676-3e2d-441d-97a7-12199ef4f2ba` trong cả file JSON bài đọc lẫn `_index.json`.

## Files to Create / Modify
- Create: `packages/db/src/seed/reading-library-dataset.test.ts`
- Create: `packages/db/turbo.json`
- Modify: `scripts/ci-workflow.test.mjs`
- Rename & Modify: `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` → `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json`
- Modify: `docs/reading-ielts/reading-practice/_index.json`

## Tests Before
- Tạo `packages/db/src/seed/reading-library-dataset.test.ts` kiểm tra:
  1. Unit test cho hàm helper `findDuplicatedTitlePhrase(title)`: khẳng định trả kết quả khớp trên `OLD_TITLE` (167 ký tự) và trả `null` trên `NEW_TITLE` (86 ký tự, dù `"investment in "` dài 14 ký tự xuất hiện lại ở vị trí 28).
  2. Mọi entry trong `_index.json` (351 bài) đều tồn tại file tương ứng trên đĩa, khớp 1-1 danh sách `*.json` (trừ `_index.json`), và khớp `id`, `title`.
  3. Bài `b8927676-3e2d-441d-97a7-12199ef4f2ba` có `"file": "Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json"`, `"title": "Investment in shares versus investment in other assets - which gives the greater gain?"`, `"passage.title": "Investment in shares versus investment in other assets"`, `"passage_number": 2`, `"time_minutes": 20`, `"question_range": "14-26"`, `passage.paragraphs.length === 11` (chứa đủ nhãn `A.`..`G.`), `question_groups.length === 3`, và tổng 13 câu hỏi (`14..26`).
  4. Không có bài Reading nào trong toàn bộ 351 bài vi phạm `findDuplicatedTitlePhrase(title)`.

## Tasks & Steps

### Task 1.1 — Viết TDD dataset integrity test cho bộ Reading (Red phase)
- **Goal:** Tạo test `packages/db/src/seed/reading-library-dataset.test.ts` fail đúng lý do trên trạng thái dataset hiện tại.
- **Target files and symbols:**
  - `packages/db/src/seed/reading-library-dataset.test.ts` (định vị `docs/reading-ielts/reading-practice` qua `resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/reading-ielts/reading-practice")` theo mẫu `packages/db/src/seed/listening-library.ts:14-17`)
- **Steps:**
  1. Cài đặt helper thuần `findDuplicatedTitlePhrase(title: string): string | null`:
     - Chuẩn hóa `const norm = title.trim().toLowerCase()`.
     - **Nhánh 1 (tiền tố lặp liền kề độ dài biến thiên):** duyệt `for (let len = 12; len <= Math.floor(norm.length / 2); len++)`; đặt `const prefix = norm.slice(0, len)` và `const secondIdx = norm.indexOf(prefix, len)`; nếu `secondIdx !== -1 && secondIdx - len <= 5` trả về `prefix`. (Không dùng tiền tố cố định 12 ký tự và không kiểm tra `secondIdx` cách xa > 5 ký tự để tránh false positive trên `"investment in "` ở vị trí 28 của `NEW_TITLE`.)
     - **Nhánh 2 (lặp chuỗi 4 từ liên tiếp):** tách `const words = norm.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)`; duyệt mọi cụm 4 từ liên tiếp `words.slice(i, i + 4).join(" ")` và kiểm tra có xuất hiện lại từ vị trí `j >= i + 4` không.
  2. Viết 4 test case trong `packages/db/src/seed/reading-library-dataset.test.ts`:
     - Case 1: Helper self-test: `expect(findDuplicatedTitlePhrase(OLD_TITLE)).not.toBeNull()` và `expect(findDuplicatedTitlePhrase(NEW_TITLE)).toBeNull()`.
     - Case 2: Đọc `_index.json`, xác nhận `length === 351`, tập `entry.file` khớp 1-1 danh sách file `*.json` (loại `_index.json`) trên đĩa, và từng file JSON khớp `id` + `title` với `_index.json`.
     - Case 3: Kiểm tra bài `id === "b8927676-3e2d-441d-97a7-12199ef4f2ba"` có đúng `file` sạch, `title === NEW_TITLE`, `passage.title === "Investment in shares versus investment in other assets"`, `passage_number === 2`, `time_minutes === 20`, `question_range === "14-26"`, `passage.paragraphs` có 11 phần tử không rỗng (chứa đủ nhãn `A.`..`G.`), `question_groups` có 3 nhóm và tổng 13 câu hỏi.
     - Case 4: Quét toàn bộ 351 `title` trong `_index.json` bằng `findDuplicatedTitlePhrase`, assert danh sách vi phạm rỗng (`[]`).
  3. Chạy vitest xác nhận Red phase thất bại đúng vào entry `b8927676-3e2d-441d-97a7-12199ef4f2ba`.
- **Success criteria:** Case 1 và Case 2 pass, còn Case 3 và Case 4 fail đúng vì tên file cũ và tiêu đề 167 ký tự bị lặp.
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts` exits non-zero with assertion failure on `b8927676-3e2d-441d-97a7-12199ef4f2ba` (passing test is a failure).

### Task 1.2 — Đổi tên file JSON, sửa tiêu đề sạch và khai báo Turbo inputs cho `@teacher-os/db` (Green phase)
- **Goal:** Sửa tiêu đề lặp đôi trong file bài đọc và `_index.json`, đổi tên file sang slug sạch bằng `git mv`, và cấu hình `packages/db/turbo.json` + test guard ở `scripts/ci-workflow.test.mjs` để CI luôn chạy lại test khi dataset thay đổi.
- **Target files and symbols:**
  - `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` (dòng 4 `"title"`)
  - `docs/reading-ielts/reading-practice/_index.json` (dòng 4012 `"file"`, dòng 4014 `"title"`)
  - `packages/db/turbo.json` (new, theo mẫu `apps/server/turbo.json:1-15`)
  - `scripts/ci-workflow.test.mjs` (thêm assertion xác nhận `packages/db/turbo.json` khai báo `tasks.test.inputs` ngay sau kiểm tra `apps/server/turbo.json:396-413`)
- **Steps:**
  1. Chạy `git mv` đổi tên file từ `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json` sang `docs/reading-ielts/reading-practice/Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json`.
  2. Sửa dòng 4 của file JSON mới: đổi `"title"` thành `"Investment in shares versus investment in other assets - which gives the greater gain?"` (giữ nguyên tab indentation chuẩn Biome và mọi trường khác: `id`, `url`, `passage.title`, `paragraphs`, `question_groups`).
  3. Sửa dòng 4012–4014 của `docs/reading-ielts/reading-practice/_index.json`: đổi `"file"` sang `"Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json"` và `"title"` sang `"Investment in shares versus investment in other assets - which gives the greater gain?"`.
  4. Tạo `packages/db/turbo.json` (tab indentation chuẩn Biome):
     ```json
     {
     	"$schema": "https://turbo.build/schema.json",
     	"extends": ["//"],
     	"tasks": {
     		"test": {
     			"inputs": [
     				"$TURBO_DEFAULT$",
     				".env*",
     				"../../docs/reading-ielts/reading-practice/**",
     				"../../docs/listening_ielts/**"
     			]
     		}
     	}
     }
     ```
  5. Trong `scripts/ci-workflow.test.mjs` ngay sau kiểm tra `apps/server/turbo.json` (`lines 396-413`), bổ sung assertion kiểm tra `packages/db/turbo.json` tồn tại và `tasks.test.inputs` chứa đủ 4 mục trên.
  6. Chạy lại `reading-library-dataset.test.ts` và `pnpm test:ci-workflow`.
- **Success criteria:** Tất cả 4 test case trong `reading-library-dataset.test.ts` pass và `pnpm test:ci-workflow` pass.
- **Verify:** `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts && pnpm test:ci-workflow` exits 0 and reports all tests passed.

## Regression Gate
- `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts`
- `pnpm test:ci-workflow`

## Verification
- `pnpm --filter @teacher-os/db exec vitest run src/seed/reading-library-dataset.test.ts && pnpm test:ci-workflow`

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
