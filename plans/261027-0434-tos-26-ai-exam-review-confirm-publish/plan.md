---
title: "TOS-26: Chỉnh sửa tay miễn phí (0 Credit) và bắt buộc xác nhận câu Cần rà soát lại trước khi xuất bản"
description: "Biến cột phải màn [6] thành trình chỉnh sửa (đoạn văn, câu hỏi, đáp án) 0 Credit; Lưu bản nháp luôn được phép; Lưu vào Ngân hàng đề bị khóa tới khi tích xác nhận các câu gắn nhãn Cần rà soát lại, server kiểm lại cổng này rồi tạo assignment_prompt + assignment_test ready."
status: completed
priority: P0
effort: 2d
issue: 472
branch: ai-handle-issue-472
tags: [feature, backend, frontend, e2e]
blockedBy: [470]
blocks: []
created: 2026-10-27
---

# Plan: TOS-26 — Chỉnh sửa tay 0 Credit và cổng xác nhận "Cần rà soát lại"

## Overview

AC-003 của US-005 (FR-selfomy-alignment-016, FR-selfomy-alignment-017):

> Bản đề bóc tách có ≥ 1 câu gắn nhãn vàng **"(!) Cần rà soát lại"** → người dùng sửa văn bản/câu hỏi/đáp án bằng tay (**0 Credit**) nhưng chưa tích **"Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại"** → cho bấm **"Lưu bản nháp"** nhưng **khóa "Lưu vào Ngân hàng đề"** → tích xác nhận xong thì nút được mở khóa để xuất bản đề chính thức.

Nguồn: Jira [TOS-26](https://teacher-os.atlassian.net/browse/TOS-26) (subtask của TOS-20 / US-005 · AC-003), `docs/selfomy-alignment/userstories/us-005.md`, UC bước 7, wireframe `ai-teaching-assistant-flow.md#Screen: ai-exam-import-workspace` mục 6–11, 13, 14.

## Scope Challenge

- **Phụ thuộc TOS-24:** `exam_import_job.draft_json` (cấu trúc `ExtractedExam` có `needsReview`), màn `[6]` read-only.
- **Có sẵn:** ngân hàng đề org `assignment_prompt` (`passage`, `questions` JSON theo `assignmentQuestionSchema` có `explanation`), `assignment_test` + `assignment_test_part` với slot `ASSIGNMENT_TEST_PRESETS` (`packages/api/src/contracts.ts:319`), route `apps/server/src/routes/assignments/tests.ts`; editor rich text Tiptap dùng chung (plan `261026-1243-tiptap-full-editor`).
- **Mode:** fast + scout, HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **"Ngân hàng đề" = `assignment_prompt` + `assignment_test` của org.** Xuất bản tạo 1 `assignment_prompt` mỗi part (`skill`, `part = slot.part`, `type` thuộc `ASSIGNMENT_PART_TYPES[skill].types[slot.part]`, `title = "${draft.title} — ${slot.label}"`, `source = "AI import: <file_name>"`) và 1 `assignment_test` nối các prompt vào slot theo `ASSIGNMENT_TEST_PRESETS` của skill. Trạng thái `status = 'ready'` cho `reading`/`writing`/`speaking`, và `status = 'draft'` khi `skill === 'listening'` (chưa có audio theo gate `assignmentPromptCreateSchema`). | Tái dùng đúng nơi giáo viên giao bài cho lớp; không tạo bảng đề mới; đồng nhất gate audio của builder. |
| D2 | **Lưu bản nháp** `PATCH /api/exam-imports/:id/draft` nhận body `{ draft }` theo `extractedExamDraftSchema` (chấp nhận rich text cho `passage`/`explanation`), đối chiếu `row.draftJson` hiện tại trong DB để **bảo toàn `confidence` và cờ `needsReview` gốc phía server** (sửa câu không tự xóa `needsReview`, client không thể hạ `needsReview: true → false`), ghi đè `draft_json`, **không đụng ví** (0 Credit), cho phép bất kể trạng thái xác nhận. | AC: chỉnh tay miễn phí; nhãn chỉ được "giải" bằng xác nhận tường minh; chống client-controlled gate bypass. |
| D3 | **Cổng xác nhận 2 lớp + CSRF guard:** client khóa nút khi `reviewCount > 0 && !confirmed`; server `POST /api/exam-imports/:id/publish` body `{ draft, reviewConfirmed: boolean }` đếm `needsReview` trên draft đã hợp nhất với `row.draftJson` trong DB — trả 422 `REVIEW_CONFIRMATION_REQUIRED` nếu còn câu `needsReview` mà `reviewConfirmed !== true`. Cả `PATCH /:id/draft` và `POST /:id/publish` kiểm tra `Origin` thuộc `corsOrigin`/`corsOrigins` + `Content-Type: application/json`, `canImportExam(kernelCtx.role)` (403), và `importStatus === "completed"` (409). Đề không có câu nào gắn nhãn → không hiện hộp kiểm, nút mở sẵn. | Không tin riêng UI; đúng FR-017; bảo vệ CSRF ngoài `kernelRoutes`. |
| D4 | **Map câu hỏi & forward `explanation`:** Chuẩn hóa `stem`, `opts`, `answer` (`answer ?? ""`, quy đổi đáp án MCQ sang nhãn `A..D` nếu đang ở dạng text phương án), `type` (map về catalog của slot hoặc `null`), `explanation` (`q.explanation ?? undefined`) rồi validate qua `assignmentQuestionSchema.parse` + kiểm tra câu có `stem` và `answer` không rỗng khi publish `ready`; lỗi → 422 `INVALID_DRAFT` kèm `{ partIndex, questionIndex }` đã whitelist (không lộ raw `ZodError`). Bổ sung `explanation` vào `parseQuestions` trong `apps/server/src/routes/snapshot.ts` để round-trip qua snapshot. | Giữ contract ngân hàng đề nguyên vẹn và không làm rơi `explanation` khi tải lại. |
| D5 | **Giới hạn slot & Listening:** số part vượt số slot preset (vd reading > 3 passage) → 422 `TOO_MANY_PARTS` với hướng dẫn xóa/gộp part; skill `mixed` phải chọn skill cụ thể trước khi xuất bản (422 `SKILL_MIXED_NOT_ALLOWED`). Listening chưa có audio: do gate `assignmentPromptCreateSchema` (`contracts.ts:747-752`) và `TestBuilderShell` chặn `ready` khi thiếu `audioName`, khi xuất bản đề `listening` sẽ lưu `assignment_prompt` + `assignment_test` ở `status = 'draft'` và báo "Đã lưu bộ đề nháp — cần bổ sung file nghe trước khi giao bài". | Tôn trọng ràng buộc `assignment_test_part` (unique slot) và gate `audio required when ready`. |
| D6 | **Idempotent & chống TOCTOU:** Migration `0052` thêm cột `published_test_id` (nullable) vào `exam_import_job` và thêm `publishedTestId: z.string().nullish()` vào `examImportJobSchema`. Khi publish, nếu `row.publishedTestId` đã có và `assignment_test` đó còn tồn tại trong org → trả `{ testId: row.publishedTestId }` cũ; nếu chưa có (hoặc đề cũ đã bị xóa) → dùng ID tất định theo `job.id` trong `db.batch` để chống race 2 request song song nhân bản đề. | Tránh bấm 2 lần hoặc đua song song sinh 2 đề; tương thích `/readyz`. |
| D7 | **UI:** cột phải dùng controlled React state (theo pattern `PromptComposer` / `TestHeaderForm`, không dùng `react-hook-form`), bọc `normalizeLegacyRichText` khi nạp `passage` vào `RichTextEditor` (Tiptap) — tên đề (1–200), kỹ năng, thời gian (phút), passage, thẻ câu (stem, phương án, đáp án đúng, giải thích, loại); thẻ `needsReview` giữ viền + nhãn vàng. Hộp kiểm `[11]` "Tôi đã kiểm tra và xác nhận <N> câu gắn nhãn Cần rà soát lại"; `[13]` "Lưu bản nháp" (secondary), `[14]` "Lưu vào Ngân hàng đề" (primary, `disabled` + `aria-describedby` lý do). Xuất bản xong → `await useData().refresh()` để đồng bộ snapshot `['kernel']` rồi mới toast + điều hướng `/assignments/tests/<id>`. | Wireframe mục 6–14; tránh `notFound()` tại `/assignments/tests/$id`. |

## Non-goals

- Gọi AI lại để sửa câu (mọi chỉnh sửa ở đây là tay, 0 Credit).
- Upload audio Listening trong màn `[6]`.
- Gắn đề vào Phòng thi ảo công khai (US-008).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-draft-and-publish-api.md](phase-01-draft-and-publish-api.md): `PATCH /draft`, `POST /publish` + cổng xác nhận + map sang ngân hàng đề | 6h | completed | TOS-24 |
| 2 | [phase-02-editable-review-panel.md](phase-02-editable-review-panel.md): cột phải chỉnh sửa, hộp kiểm xác nhận, 2 nút lưu | 7h | completed | 1 |
| 3 | [phase-03-e2e-ac-003.md](phase-03-e2e-ac-003.md): E2E khóa/mở khóa nút xuất bản | 2h | completed | 2 |

## Acceptance criteria (từ AC-003)

- [x] Sửa passage/câu/đáp án rồi "Lưu bản nháp" → `draft_json` cập nhật, `credit_usage_log` không có dòng mới, ví không đổi.
- [x] Còn câu "(!) Cần rà soát lại" và chưa tích → "Lưu vào Ngân hàng đề" `disabled`; gọi thẳng API publish với `reviewConfirmed: false` → 422 `REVIEW_CONFIRMATION_REQUIRED`.
- [x] Tích xác nhận → nút mở khóa; xuất bản tạo `assignment_test` `ready` + prompt theo slot, xuất hiện trong danh sách đề ngân hàng; publish lần 2 không nhân bản.
- [x] Đề không có câu gắn nhãn → không hiện hộp kiểm, nút mở sẵn.

## Validation

- `pnpm --filter server test -- exam-imports`, `pnpm --filter web test -- import extracted-exam`, `pnpm check`, `pnpm check-types`.
- `pnpm --filter e2e e2e -- ai-exam-import-ac-003` (port 8100/8101/8103/8104); 3 viewport + focus bàn phím; `pnpm design:compare`.

## Red Team Review

### Session — 2026-10-27
**Findings:** 9 (9 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 4 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Lỗ hổng CSRF trên `PATCH /:id/draft` và `POST /:id/publish` do `examImportRoutes` mount ngoài `kernelRoutes` (`apps/server/src/app.ts:354`, `kernel.ts:146-163`) | Critical | Accept | D3, Phase 1 |
| 2 | Xung đột `extractedExamSchema.strict()` vs `extractedExamDraftSchema` và nguy cơ client tự xóa/giả mạo `needsReview` (`contracts.ts:3715-3765`, `exam-imports.ts:51-89`) | Critical | Accept | D2, D3, Phase 1 |
| 3 | Bất tương thích dữ liệu khi map `ExtractedExam` sang `assignment_prompt`/`assignmentQuestionSchema` và `snapshot.ts:parseQuestions` làm rơi `explanation` (`contracts.ts:287-312,603-643`, `snapshot.ts:159-176`) | Critical | Accept | D1, D4, Phase 1 |
| 4 | Điều hướng `/assignments/tests/<id>` ngay sau `POST /publish` ném `notFound()` nếu chưa gọi `await useData().refresh()`, và `/assignments` hiển thị `assignmentPrompts` (`tests/$id.tsx:22-26`, `assignments/index.tsx:244-258`) | Critical | Accept | D7, Phase 2, Phase 3 |
| 5 | Race condition TOCTOU khi 2 request `POST /:id/publish` chạy song song & xử lý khi `published_test_id` đã bị xóa (`wallet.ts:90-146`, `tests.ts:133-159`) | High | Accept | D6, Phase 1 |
| 6 | Bắt buộc kiểm tra `canImportExam(kernelCtx.role)` (403) và `importStatus === "completed"` (409) cho cả `PATCH /:id/draft` lẫn `POST /:id/publish` (`exam-imports.ts:123-125,345-393`) | High | Accept | D3, Phase 1 |
| 7 | `react-hook-form` không tồn tại trong repo; phải dùng controlled state + `normalizeLegacyRichText` cho Tiptap và cập nhật `import.tsx` + `import.test.tsx` (`apps/web/package.json:15-57`, `rich-text-legacy.ts:4-8`) | High | Accept | D7, Phase 2 |
| 8 | Gate `assignmentPromptCreateSchema` (`contracts.ts:747-752`) chặn `ready` cho Listening chưa có audio → xuất bản Listening để `status = 'draft'` theo D5 | High | Accept | D1, D5, Phase 1 |
| 9 | Đồng bộ migration `0052` + `_journal.json` cho `/readyz`, thêm `publishedTestId` vào `examImportJobSchema`, và không lộ raw `ZodError` ở 422 (`readiness.ts:44-52`, `contracts.ts:3769-3785`) | Medium | Accept | D4, D6, Phase 1 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-draft-and-publish-api.md`, `phase-02-editable-review-panel.md`, `phase-03-e2e-ac-003.md`
- Decision deltas checked: 9
- Reconciled stale references: 9 (`react-hook-form` → controlled state + `normalizeLegacyRichText`; `extractedExamSchema` → `extractedExamDraftSchema` + server-side `needsReview` preservation; Listening `ready` vs `draft` → `draft` khi thiếu audio; thêm `await useData().refresh()` trước navigate; bổ sung `snapshot.ts` forward `explanation`)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Standard (Fact Checker + Contract Verifier + Flow Tracer)
- **Claims checked:** 36
- **Verified:** 26 | **Failed:** 10 (đã cập nhật toàn bộ vào D1–D7 và Phase 1–3) | **Unverified:** 0

#### Key Decisions Confirmed
1. **Listening chưa có audio (D5):** Lưu `assignment_prompt` và `assignment_test` ở `status = "draft"` để khớp gate `audio required when ready` của `assignmentPromptCreateSchema` (`packages/api/src/contracts.ts:747-752`) và `TestBuilderShell`; với `reading`/`writing`/`speaking` lưu `status = "ready"`.
2. **Bảo toàn `needsReview` phía server (D2, D3):** Server hợp nhất `draft` từ client với `row.draftJson` trong DB để câu đã gắn `needsReview: true` không bao giờ bị xóa qua `PATCH /draft` hay `POST /publish`; chỉ mở cổng xuất bản khi `reviewConfirmed === true`.
3. **Đồng bộ Kernel Snapshot trước điều hướng (D7):** Gọi `await refresh()` từ `useData()` trước khi `navigate({ to: "/assignments/tests/$id", params: { id: testId } })`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-draft-and-publish-api.md`, `phase-02-editable-review-panel.md`, `phase-03-e2e-ac-003.md`
- Decision deltas checked: 9
- Reconciled stale references: 9
- Unresolved contradictions: 0
