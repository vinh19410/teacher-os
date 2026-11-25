---
phase: 2
title: "Phase 2: Listening Importer Normalization & Verification Hardening"
status: completed
priority: P1
effort: "35m"
dependencies: [1]
---

# Phase 2: Listening Importer Normalization & Verification Hardening

<!-- Updated: Red-Team Session 1 - added unknownPartSourceMatches + updated error message, enforced --public-logs suppression & control-char sanitization & ORDER BY id ASC LIMIT 500 & LISTENING_TEST_ID_PREFIX, fixed line citation 327-336, specified temp --data-dir fixture for CLI tests -->

## Goal

Chuẩn hóa nguồn `"Unknown"` (không phân biệt hoa/thường) sang `"Other sources"` trong `normalizeCollectionAndGroup`, bổ sung kiểm chứng cả `unknownCollectionMatches === 0` lẫn `unknownPartSourceMatches === 0` trong `verifyListeningLibraryInDb`, và ghi log cảnh báo non-fatal an toàn (`--public-logs`, chống log/command injection, có `ORDER BY`/`LIMIT`) trong `import-listening-library.ts` nếu DB có đề non-`lib-listen-%` `ready` trùng tiêu đề với tập import.

## Files to Create / Modify

- Modify: `packages/db/src/seed/listening-library.ts`
- Modify: `packages/db/scripts/import-listening-library.ts`
- Modify: `packages/db/src/seed/listening-library.test.ts`
- Modify: `apps/server/src/listening-library-import.test.ts`

## Tasks & Steps

### Task 2.1 — Write TDD Red tests for Unknown normalization, verifyListeningLibraryInDb, and safe CLI duplicate warnings
- **Goal:** Bổ sung unit & integration tests khóa chặt hành vi chuẩn hóa `"Unknown"` → `"Other sources"`, cả `unknownCollectionMatches` lẫn `unknownPartSourceMatches` trong `verifyListeningLibraryInDb`, và cảnh báo non-fatal an toàn `--public-logs`/anti-injection trong `runImportListeningCli`, rồi xác nhận test FAIL (Red phase).
- **Target files and symbols:**
  - `packages/db/src/seed/listening-library.test.ts` (describe `"listening-library transformer"` + describe mới `"verifyListeningLibraryInDb & import CLI warnings"`)
  - `apps/server/src/listening-library-import.test.ts` (test full import 498 files + Student Practice facets)
- **Steps:**
  1. Trong `packages/db/src/seed/listening-library.test.ts`:
     - Trong test `"Talking about the history of bikes Q5 blank aligns grammatically..."` (line 148): thêm assertions `expect(item.collection).toBe("Other sources")`, `expect(item.testGroup).toBe("Section 4")`, `expect(item.part.source).toBe("Other sources — Section 4")`.
     - Thêm test kiểm tra `transformListeningFile` với `source: "Unknown"`, `source: "  unknown  "`, `source: ""`, và `source: undefined` đều chuẩn hóa thành `collection: "Other sources"`, `part.source: "Other sources — Section 2"`, trong khi `source: "Actual Test"` giữ nguyên `"Actual Test"`.
     - Thêm test kiểm tra `verifyListeningLibraryInDb`:
       - Trả `unknownCollectionMatches: 1`, `unknownPartSourceMatches: 0`, `ok: false` khi 1 dòng `lib-listen-%` còn `collection = 'Unknown'`.
       - Trả `unknownCollectionMatches: 0`, `unknownPartSourceMatches: 1`, `ok: false` khi `library_test.collection = 'Other sources'` nhưng `library_test_part.source = 'Unknown — Section 4'`.
       - Trả `unknownCollectionMatches: 0`, `unknownPartSourceMatches: 0`, `ok: true` khi cả 2 bảng sạch.
     - Thêm test cho `runImportListeningCli` dùng thư mục `--data-dir <tempDir>` chứa 1 file fixture `Unknown-S4-talking-about-the-history-of-bikes.json` (copy từ `DEFAULT_LISTENING_DATA_DIR`) + SQLite tạm `--file <tempDb>` đã khởi tạo schema tối thiểu (`library_test`, `library_test_part`), seed 1 đề non-`lib-listen-%` `status='ready'` có tiêu đề `"Talking about the history of bikes"` và 1 đề độc hại `title = "Talking about the history of bikes"` / kiểm tra thêm fixture title chứa `"\n::error::injected"`:
       - Chế độ thường (`--file <tempDb> --data-dir <tempDir> --mode apply --skip-media --verify`): trả exit code `0` (non-fatal), output chứa `WARNING:` với `non-lib-listen`, không chứa ký tự xuống dòng raw tiêm workflow command `::error::injected` trên dòng mới, và dòng verify chứa `unknownCollectionMatches=0, unknownPartSourceMatches=0`.
       - Chế độ `--public-logs` (`--file <tempDb> --data-dir <tempDir> --mode audit --public-logs`): trả exit code `0`, output chứa tổng số lượng trùng và **không chứa** UUID `id` nội bộ hay tiêu đề thô từ DB.
  2. Trong `apps/server/src/listening-library-import.test.ts`:
     - Assert `verify.unknownCollectionMatches === 0` và `verify.unknownPartSourceMatches === 0`.
     - Gọi `/api/student/practice?skill=listening&page=1&facets=1` sau khi import 498 file và assert:
       - `catalog.facets?.collections` **không chứa** `"Unknown"` và **có chứa** `"Other sources"`.
       - Tìm đề `"Talking about the history of bikes"` (`?skill=listening&q=Talking+about+the+history+of+bikes`) trả `total === 1`, `items[0].collection === "Other sources"`, `items[0].testGroup === "Section 4"`.
  3. Chạy `listening-library.test.ts` để xác nhận Red phase.
- **Success criteria:** Tests mới thất bại rõ ràng do `normalizeCollectionAndGroup` vẫn trả `"Unknown"` và `verifyListeningLibraryInDb` chưa có `unknownCollectionMatches`/`unknownPartSourceMatches`.
- **Verify:** `pnpm --filter @teacher-os/db test src/seed/listening-library.test.ts` exits non-zero with assertion failure (Red phase; passing test here is a failure).

### Task 2.2 — Implement Unknown normalization, dual verify gate, and safe CLI duplicate warning (Green phase)
- **Goal:** Cập nhật `listening-library.ts` và `import-listening-library.ts` để vượt toàn bộ tests mới mà không phá vỡ bất kỳ caller hay quy tắc bảo mật CI nào.
- **Target files and symbols:**
  - `packages/db/src/seed/listening-library.ts` (`normalizeCollectionAndGroup`, `ListeningLibraryVerifyResult`, `verifyListeningLibraryInDb`)
  - `packages/db/scripts/import-listening-library.ts` (`runImportListeningCli`, import `LISTENING_TEST_ID_PREFIX`)
- **Steps:**
  1. Trong `packages/db/src/seed/listening-library.ts:240-260` (`normalizeCollectionAndGroup`):
     - Đổi dòng 244 thành:
       ```ts
       const trimmed = (rawSource ?? "").trim();
       const source =
       	!trimmed || /^unknown$/i.test(trimmed) ? "Other sources" : trimmed;
       ```
     - Giữ nguyên logic tách `^C(\d+)T(\d+)$` và trả `{ collection: source, testGroup: "Section ${section}", partSource: "${source} — Section ${section}" }`.
  2. Trong `packages/db/src/seed/listening-library.ts:869-935` (`ListeningLibraryVerifyResult` và `verifyListeningLibraryInDb`):
     - Thêm hai trường `unknownCollectionMatches: number;` và `unknownPartSourceMatches: number;` vào interface `ListeningLibraryVerifyResult`.
     - Trong `verifyListeningLibraryInDb`, thêm 2 truy vấn đếm dùng `SUBSTR` với hằng `LISTENING_TEST_ID_PREFIX` / `LISTENING_PART_ID_PREFIX`:
       ```ts
       const unknownColRows = await runner.queryRows(
       	`SELECT COUNT(*) AS n FROM library_test WHERE SUBSTR(id, 1, ${LISTENING_TEST_ID_PREFIX.length}) = '${LISTENING_TEST_ID_PREFIX}' AND lower(trim(coalesce(collection, ''))) = 'unknown';`,
       );
       const unknownCollectionMatches = Number(unknownColRows[0]?.n ?? 0);

       const unknownPartRows = await runner.queryRows(
       	`SELECT COUNT(*) AS n FROM library_test_part WHERE SUBSTR(id, 1, ${LISTENING_PART_ID_PREFIX.length}) = '${LISTENING_PART_ID_PREFIX}' AND (lower(trim(coalesce(source, ''))) = 'unknown' OR lower(substr(trim(coalesce(source, '')), 1, 10)) = 'unknown — ');`,
       );
       const unknownPartSourceMatches = Number(unknownPartRows[0]?.n ?? 0);
       ```
     - Đưa `&& unknownCollectionMatches === 0 && unknownPartSourceMatches === 0` vào biểu thức `ok` và trả cả 2 trường trong object kết quả.
  3. Trong `packages/db/scripts/import-listening-library.ts` (`runImportListeningCli`):
     - Import `LISTENING_TEST_ID_PREFIX` từ `../src/seed/listening-library`.
     - Trong khối `if (runner.queryRows)` (`import-listening-library.ts:327-336`, trước dấu `}` ở dòng 337): truy vấn read-only có thứ tự và giới hạn:
       ```sql
       SELECT id, title FROM library_test
       WHERE skill = 'listening' AND status = 'ready'
         AND SUBSTR(id, 1, ${LISTENING_TEST_ID_PREFIX.length}) <> '${LISTENING_TEST_ID_PREFIX}'
       ORDER BY id ASC LIMIT 500;
       ```
       Đối chiếu `title.trim().toLowerCase()` (sau khi gộp whitespace/control chars) với tập tiêu đề của `dataset.items`. Nếu `duplicates.length > 0`:
       - Khi `args.publicLogs === true`: chỉ log số lượng (`[listening-import] WARNING: Found ${duplicates.length} pre-existing non-lib-listen ready listening test(s) sharing titles with imported dataset (details suppressed under --public-logs).`).
       - Khi `args.publicLogs === false`: làm sạch mọi ký tự điều khiển (`[\r\n\t\x00-\x1f\x7f]+` → `" "`) và bọc `redactSensitive(..., secretsToRedact)` trước khi in tối đa 10 mục. Không ném lỗi (non-fatal).
     - Tại dòng 422 (verify log): bổ sung `unknownCollectionMatches=${report.unknownCollectionMatches}, unknownPartSourceMatches=${report.unknownPartSourceMatches}`.
     - Tại dòng 425–427: cập nhật thông điệp lỗi khi `!report.ok` để phản ánh đầy đủ cả sai lệch số lượng lẫn metadata bẩn (`Verification failed: DB rows do not match expected dataset counts or metadata cleanliness checks.`).
  4. Chạy lại cả hai suite test + `scripts/ci-workflow.test.mjs` để xác nhận Green phase.
- **Success criteria:** Mọi test trong `listening-library.test.ts`, `listening-library-import.test.ts`, và `ci-workflow.test.mjs` pass 100%.
- **Verify:** `pnpm --filter @teacher-os/db test src/seed/listening-library.test.ts && pnpm --filter server test src/listening-library-import.test.ts && node --test scripts/ci-workflow.test.mjs` exits 0 and prints `passed`.

## Verification

- `pnpm --filter @teacher-os/db test src/seed/listening-library.test.ts`
- `pnpm --filter server test src/listening-library-import.test.ts`
- `node --test scripts/ci-workflow.test.mjs`

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
