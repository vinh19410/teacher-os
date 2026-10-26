---
title: "TOS-26: Chỉnh sửa tay miễn phí (0 Credit) và bắt buộc xác nhận câu Cần rà soát lại trước khi xuất bản"
description: "Biến cột phải màn [6] thành trình chỉnh sửa (đoạn văn, câu hỏi, đáp án) 0 Credit; Lưu bản nháp luôn được phép; Lưu vào Ngân hàng đề bị khóa tới khi tích xác nhận các câu gắn nhãn Cần rà soát lại, server kiểm lại cổng này rồi tạo assignment_prompt + assignment_test ready."
status: pending
priority: P0
effort: 2d
issue: 472
branch: null
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
| D1 | **"Ngân hàng đề" = `assignment_prompt` + `assignment_test` của org.** Xuất bản tạo 1 `assignment_prompt` mỗi part (skill/part theo đề, `status = 'ready'`, `source = "AI import: <file_name>"`) và 1 `assignment_test` (`status = 'ready'`) nối các prompt vào slot theo `ASSIGNMENT_TEST_PRESETS` của skill. | Tái dùng đúng nơi giáo viên giao bài cho lớp; không tạo bảng đề mới. |
| D2 | **Lưu bản nháp** `PATCH /api/exam-imports/:id/draft` ghi đè `draft_json` (validate `extractedExamSchema` + giới hạn của `assignmentQuestionSchema`), **không đụng ví** (0 Credit), cho phép bất kể trạng thái xác nhận. Sửa câu **không tự xóa** `needsReview`. | AC: chỉnh tay miễn phí; nhãn chỉ được "giải" bằng xác nhận tường minh. |
| D3 | **Cổng xác nhận 2 lớp:** client khóa nút khi `reviewCount > 0 && !confirmed`; server `POST /api/exam-imports/:id/publish` body `{ draft, reviewConfirmed: boolean }` trả 422 `REVIEW_CONFIRMATION_REQUIRED` nếu draft còn câu `needsReview` mà `reviewConfirmed !== true`. Đề không có câu nào gắn nhãn → không hiện hộp kiểm, nút mở sẵn. | Không tin riêng UI; đúng FR-017. |
| D4 | **Map câu hỏi:** `stem`, `opts`, `answer`, `type`, `explanation` copy sang `assignmentQuestionSchema` (bỏ `confidence`/`needsReview`); validate bằng chính schema đó trước khi INSERT, lỗi → 422 kèm chỉ số câu. | Giữ contract ngân hàng đề nguyên vẹn. |
| D5 | **Giới hạn slot:** số part vượt số slot preset (vd reading > 3 passage) → 422 `TOO_MANY_PARTS` với hướng dẫn xóa/gộp part; skill `mixed` phải chọn skill cụ thể trước khi xuất bản. Listening xuất bản được nhưng chưa có audio — test vẫn `ready` theo gate hiện có của builder (nếu gate chặn → để `draft` và báo "Cần bổ sung audio"). | Tôn trọng ràng buộc `assignment_test_part` (unique slot). |
| D6 | **Idempotent:** job lưu `published_test_id`; publish lần 2 trả test cũ (không nhân bản). Migration thêm cột `published_test_id` (nullable) vào `exam_import_job`. | Tránh bấm 2 lần sinh 2 đề. |
| D7 | **UI:** cột phải dùng form (react-hook-form theo pattern trang soạn đề) — tên đề (1–200), kỹ năng, thời gian (phút), passage (Tiptap), thẻ câu (stem, phương án, đáp án đúng, giải thích, loại); thẻ `needsReview` giữ viền + nhãn vàng. Hộp kiểm `[11]` "Tôi đã kiểm tra và xác nhận <N> câu gắn nhãn Cần rà soát lại"; `[13]` "Lưu bản nháp" (secondary), `[14]` "Lưu vào Ngân hàng đề" (primary, `disabled` + tooltip lý do). Xuất bản xong → toast + điều hướng `/assignments/tests/<id>`. | Wireframe mục 6–14. |

## Non-goals

- Gọi AI lại để sửa câu (mọi chỉnh sửa ở đây là tay, 0 Credit).
- Upload audio Listening trong màn `[6]`.
- Gắn đề vào Phòng thi ảo công khai (US-008).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-draft-and-publish-api.md](phase-01-draft-and-publish-api.md): `PATCH /draft`, `POST /publish` + cổng xác nhận + map sang ngân hàng đề | 6h | pending | TOS-24 |
| 2 | [phase-02-editable-review-panel.md](phase-02-editable-review-panel.md): cột phải chỉnh sửa, hộp kiểm xác nhận, 2 nút lưu | 7h | pending | 1 |
| 3 | [phase-03-e2e-ac-003.md](phase-03-e2e-ac-003.md): E2E khóa/mở khóa nút xuất bản | 2h | pending | 2 |

## Acceptance criteria (từ AC-003)

- [ ] Sửa passage/câu/đáp án rồi "Lưu bản nháp" → `draft_json` cập nhật, `credit_usage_log` không có dòng mới, ví không đổi.
- [ ] Còn câu "(!) Cần rà soát lại" và chưa tích → "Lưu vào Ngân hàng đề" `disabled`; gọi thẳng API publish với `reviewConfirmed: false` → 422 `REVIEW_CONFIRMATION_REQUIRED`.
- [ ] Tích xác nhận → nút mở khóa; xuất bản tạo `assignment_test` `ready` + prompt theo slot, xuất hiện trong danh sách đề ngân hàng; publish lần 2 không nhân bản.
- [ ] Đề không có câu gắn nhãn → không hiện hộp kiểm, nút mở sẵn.

## Validation

- `pnpm --filter server test -- exam-imports`, `pnpm --filter web test -- import extracted-exam`, `pnpm check`, `pnpm check-types`.
- `pnpm --filter e2e e2e -- ai-exam-import-ac-003` (port 8100/8101/8103/8104); 3 viewport + focus bàn phím; `pnpm design:compare`.

## Cần người duyệt xác nhận

- Listening xuất bản khi chưa có audio: để `ready` hay buộc `draft` (D5).
