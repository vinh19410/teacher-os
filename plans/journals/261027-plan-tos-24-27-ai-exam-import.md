---
title: "Plan TOS-24..27: Nhập đề thi từ PDF/Ảnh bằng AI (US-005)"
date: 2026-10-27
summary: "Lập 4 plan 261027-0434 (issue #470–#473) cho AC-001..004 của US-005; TOS-24 dựng lõi Ví Credit tối thiểu và extractor Cloudflare Workers AI"
---

# Plan TOS-24..27: Nhập đề thi từ PDF/Ảnh bằng AI

## What happened
Lập 4 plan qua `ak-plan --github` từ Jira TOS-24..27 (AC-001..004 của TOS-20 / US-005), mở
issue #470–#473 (`ai-handle`, `ready to review`); #471, #472, #473 blocked by #470.

Scout cho thấy repo chưa có Ví Credit (TOS-42 / US-009 chưa có GitHub issue) và chưa có SDK
hay binding AI nào trong `apps/server`. Ngân hàng đề của tổ chức là `assignment_prompt` +
`assignment_test`; R2 `MediaStore` và DI optional trong `AppDeps` dùng lại được.

## Decision
- Người dùng chốt: TOS-24 dựng lõi ví tối thiểu (`credit_wallet`, `credit_usage_log`
  append-only, reserve/settle/release idempotent, 30 Credit Dùng thử tạo lười). TOS-42 mở rộng
  gói tháng/Top-up sau; trần cá nhân (TOS-49) là hook no-op.
- Người dùng chốt AI = Cloudflare Workers AI: `toMarkdown` → `run` với JSON schema, model là hằng.
- Không có Queue/cron và `waitUntil` không đủ 120s → bóc tách đồng bộ trong 1 request; TOS-27
  thêm dọn lười job treo > 150s và settle/release có điều kiện `processing`.
- TOS-25: chống trùng bằng SHA-256 tính cả client lẫn server, chặn trước `reserveCredits`.
- TOS-26: cổng xác nhận câu "Cần rà soát lại" ở cả UI lẫn server (422), xuất bản idempotent.

## Next steps
- Review #470 trước, chạy `/ak:cook plans/261027-0434-tos-24-ai-exam-import-reserve-extract/plan.md`;
  sau đó TOS-25 → TOS-26 → TOS-27 tuần tự (cùng sửa `exam-imports.ts` và màn `[6]`).
- Người duyệt cần chốt: 30 Credit khởi tạo, model Workers AI mặc định, Listening chưa có audio khi xuất bản.

## Ship TOS-24 (#470) — 2026-10-27 (session ai-handle-issue-470)

### What shipped
- Phase 1+2+3+4 đầy đủ: migration `0051` (3 bảng), ví Credit nguyên tử
  (`wallet.ts`: 1 `db.batch` gồm UPDATE có điều kiện + INSERT log
  `WHERE (SELECT changes() = 1)`; idempotency key trùng → trả kết quả cũ),
  extractor Workers AI + fake, routes exam-imports/credits, màn `[6]`
  (dropzone + đối chiếu 2 cột pdfjs + nhãn vàng), E2E `ai-exam-import-ac-001`.
- Leverage kongming 3 lượt: red-team plan (GO + 3 điều kiện — tất cả đã thỏa:
  test race reserve trên sqlite thật, lazy-create `ON CONFLICT DO NOTHING`,
  reserve fail xoá job+file), code review (0 Critical / 2 Important — sửa:
  `store.put` đưa vào catch-all, settle trước mark completed), e2e fail
  (CTA là Link không phải button → đổi selector spec).

### Evidence
- server 1017 test, web 1672, db 6, api 315, auth 86 — xanh; `pnpm check`
  + `check-types` repo-wide xanh; E2E AC-001 pass (cả suite: 228 pass + spec).

### Deviations
- Upload raw body + `X-File-Name` (precedent #305) thay vì multipart trong plan.
- Chấp nhận rủi ro beta: crash đúng sau settle trước UPDATE job → job kẹt
  `processing` đã settle (TOS-27 dọn); R2 put hỏng đã được catch-all bảo vệ.

### Next steps
- TOS-25 (chống trùng) — `content_fingerprint` + index đã dựng sẵn.

## Ship TOS-25 (#471) — 2026-10-27 (session ai-handle-issue-471)

### What shipped
- Phase 1+2+3 đầy đủ:
  - `findCompletedImportByFingerprint` (`apps/server/src/lib/exam-import/dedupe.ts` + 10 unit tests): lọc theo `(org_id, content_fingerprint)` với `import_status = 'completed'` và `draft_json IS NOT NULL` (tránh khoá vĩnh viễn tệp nếu job cũ rơi vào cửa sổ crash-sau-settle thiếu draft), tiebreaker deterministic `completed_at DESC, started_at DESC, id ASC`, `title` lấy từ `draft_json` fallback `fileName`.
  - `GET /api/exam-imports/lookup?fingerprint=<hex64>` (gate `canImportExam` + `fingerprintSchema`, đăng ký trước `/:id`) và nhánh chống trùng trong `POST /api/exam-imports` chạy ngay sau `sha256Hex(data)` trước `ensureWallet`/`insert`/`reserveCredits`/R2 → trả `200 { duplicateOf }` với chi phí **0 Credit** tuyệt đối.
  - Client `sha256Hex(file)` (`apps/web/src/lib/file-fingerprint.ts` + 3 unit tests, fail-open khi thiếu `crypto.subtle` hoặc lỗi mạng), `DuplicateExamBanner` (`role="status"` + 4 unit tests), union `ExamImportCreateResult` trong `repos/exam-imports.ts` (+ 5 unit tests), cập nhật `import.tsx` (`checking` + `AbortController` chống double-submit/race, guard broken-draft + 6 unit tests mới), và E2E `ai-exam-import-ac-002.spec.ts` (lookup + bypass lookup qua `POST { duplicateOf }` + 3 viewport + điều hướng bàn phím Tab → Enter).

### Evidence
- Red-team plan 3 reviewers (12 findings sau dedupe: 8 accept, 1 partial, 1 reject) + Kongming plan-gates GO + Phase-1 GO; local code review (`PendingCodeReview`) 4/4 findings resolved → Verdict `APPROVE` (`0 Critical / 0 Important / 0 Minor`).
- `pnpm check`, `pnpm check-types` (8/8), server tests, web tests, và E2E `ai-exam-import-ac-001` + `ai-exam-import-ac-002` + `ac-003` đều PASS.
