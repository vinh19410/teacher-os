---
title: "TOS-31: Nhãn giới hạn phát âm bắt buộc trên bài Speaking và miễn phí cho bản thu dưới 15 từ"
description: "Gắn bước chuyển giọng nói thành văn bản vào pipeline chấm nháp của TOS-30; bản ghi âm rỗng / < 15 từ thì không gọi AI, không giữ 2 Credit, chuyển chờ chấm tay kèm cảnh báo E-009; bài hợp lệ hiển thị trình phát 1x/1.25x/1.5x, văn bản gỡ băng và nhãn cố định giới hạn phát âm trên màn [7]."
status: pending
priority: P1
effort: 1.5d
issue: 479
branch: null
tags: [feature, backend, frontend, e2e, ai]
blockedBy: [478]
blocks: []
created: 2026-10-28
---

# Plan: TOS-31 — Nhãn giới hạn phát âm Speaking và miễn phí bản thu < 15 từ

## Overview

AC-002 của US-006 (FR-selfomy-alignment-019, BR-selfomy-alignment-006; E-selfomy-alignment-009):

> - Speaking có văn bản gỡ băng ≥ 15 từ → màn **[7]** hiển thị trình phát âm thanh gốc (**1x / 1.25x / 1.5x**), văn bản gỡ băng và nhãn cố định: *"Gợi ý từ AI (dựa trên văn bản ghi âm — chưa đánh giá tiêu chí phát âm)"*.
> - Bản ghi âm rỗng hoặc < 15 từ → **không gọi AI chấm**, **không trừ 2 Credit**, bài về trạng thái chờ xử lý kèm cảnh báo **E-selfomy-alignment-009** để giáo viên chấm tay hoặc yêu cầu thu âm lại.

Nguồn: Jira [TOS-31](https://teacher-os.atlassian.net/browse/TOS-31) (subtask của TOS-28 / US-006 · AC-002), `docs/selfomy-alignment/userstories/us-006.md`, spec lỗi E-009 (`docs/selfomy-alignment/srs/selfomy-alignment-spec.md:118`).

## Scope Challenge

- **Phụ thuộc TOS-30:** bảng `ai_grading_draft` (cột `transcript`, `error_code`), `runAiGrading`, stub `Transcriber`, panel AI trên `grading/$attemptId.tsx`.
- **Đã có:** tệp ghi âm Speaking trên R2 (`quiz_attempt.media_key`), `GET /api/grading/:attemptId/media`, `apps/web/src/components/grading/submission-media-player.tsx`.
- **Việc còn lại:** STT thật (Workers AI Whisper) + fake, đếm từ, nhánh < 15 từ, nhãn cố định, tốc độ phát.
- **Mode:** fast + scout, HOLD SCOPE.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **`Transcriber` interface thuần** (`apps/server/src/lib/ai-grading/transcriber.ts`): `transcribe({ data, mimeType }, signal) → { text }`. Adapter `createWorkersAiTranscriber` (model Whisper của Workers AI) chỉ `index.ts` import; `fakeTranscriber` cho test/e2e (trả văn bản theo tên tệp, ví dụ chứa `short` → 5 từ, `silent` → rỗng). | Theo precedent extractor/grader. |
| D2 | **Đếm từ có nghĩa** `countMeaningfulWords(text)`: tách theo khoảng trắng sau khi bỏ dấu câu, bỏ token chỉ là số/ký hiệu và từ đệm `uh, um, er, ah, hmm`. Ngưỡng `SPEAKING_MIN_WORDS = 15` trong `packages/api/src/contracts.ts`. | Spec E-009 ghi "< 15 từ có nghĩa". |
| D3 | **Thứ tự trong `runAiGrading` cho Speaking:** tải audio từ R2 → STT (không tốn Credit) → lưu `transcript` → `< 15 từ` ⇒ draft `manual_pending`, `error_code = "E-selfomy-alignment-009"`, **không reserve** → ngược lại reserve 2 Credit → chấm như Writing với transcript. STT lỗi ⇒ `manual_pending` không reserve (lỗi AI chấm thuộc TOS-33). | Kiểm điều kiện **trước** khi giữ Credit → không bao giờ có cặp reserve/release cho bản thu ngắn. |
| D4 | **Màn [7] Speaking:** `submission-media-player` thêm nút tốc độ 1x / 1.25x / 1.5x (`playbackRate`); khối "Văn bản gỡ băng" chỉ đọc; nhãn cố định ở đầu panel AI — chuỗi lấy nguyên văn, khai báo `SPEAKING_AI_LIMIT_LABEL` trong contracts, không cho ẩn. Bài E-009: banner cảnh báo với thông điệp spec, panel điểm AI trống để chấm tay. | AC-002 + BR-006. |

## Non-goals

- Chấm phát âm (pronunciation) — ngoài phạm vi theo BR-006.
- Nút "Yêu cầu học viên thu âm lại" tự động gửi thông báo — chỉ hiển thị hướng dẫn trong banner; luồng nộp lại có sẵn ở cổng học viên.
- Retry/hoàn Credit khi AI chấm lỗi, E-001 cho Speaking thiếu Credit (TOS-33 / TOS-32).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-transcriber-and-word-gate.md](phase-01-transcriber-and-word-gate.md): Transcriber + fake, đếm từ, nhánh E-009 trước reserve | 0.5d | pending | TOS-30 |
| 2 | [phase-02-speaking-review-ui.md](phase-02-speaking-review-ui.md): tốc độ phát, văn bản gỡ băng, nhãn cố định, banner E-009 | 0.5d | pending | 1 |
| 3 | [phase-03-e2e-ac-002.md](phase-03-e2e-ac-002.md): 2 scenario | 0.5d | pending | 2 |

## Acceptance criteria (từ AC-002)

- [ ] Speaking ≥ 15 từ → draft `ai_drafted`, sổ cái `reserved −2` + `settled −2`; màn [7] có trình phát với 3 mức tốc độ, văn bản gỡ băng và nhãn nguyên văn "Gợi ý từ AI (dựa trên văn bản ghi âm — chưa đánh giá tiêu chí phát âm)".
- [ ] Speaking rỗng / < 15 từ → grader không được gọi, `credit_usage_log` không có dòng nào cho attempt, draft `manual_pending` + `E-selfomy-alignment-009`; màn [7] hiện cảnh báo E-009, giáo viên chấm tay và Chốt trả bài được.
- [ ] Học viên vẫn không thấy transcript/điểm AI trước khi Chốt trả bài.

## Verify

- `pnpm --filter server test -- ai-grading`, `pnpm --filter web test -- grading`, `pnpm check && pnpm check-types`
- `pnpm --filter e2e e2e -- ai-grading-ac-002` (port override)
