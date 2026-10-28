---
title: "TOS-30: Chấm nháp ngầm Writing/Speaking ẩn với học viên cho tới khi Giáo viên bấm \"Chốt trả bài\""
description: "Nền tảng chấm nháp AI của US-006: bảng ai_grading_draft, grader interface + fake grader, tự kích hoạt khi học viên nộp bài Writing/Speaking (tạm giữ 1/2 Credit, ≤ 30 giây, settle/release), màn Rà soát [7] hiển thị điểm gợi ý 4 tiêu chí + nhận xét, lưu nháp và Chốt trả bài mới mở khóa kết quả cho học viên."
status: pending
priority: P0
effort: 3d
issue: 478
branch: null
tags: [feature, backend, frontend, e2e, ai]
blockedBy: []
blocks: [479, 480, 481]
created: 2026-10-28
---

# Plan: TOS-30 — Chấm nháp ngầm Writing/Speaking, chỉ mở khóa khi "Chốt trả bài"

## Overview

AC-001 của US-006 (FR-selfomy-alignment-013/018/019/020, BR-selfomy-alignment-001/004; NFR-selfomy-alignment-002):

> Học viên nộp Writing (hoặc Speaking hợp lệ ≥ 15 từ), ví còn đủ Credit → AI chấm nháp ≤ 30 giây → bài ở trạng thái **`ai_drafted`** với điểm gợi ý 4 tiêu chí IELTS (bước 0.5) + nhận xét trên màn **[7]**. Cổng học viên chỉ thấy **"Đã nộp — Đang chờ giáo viên chấm"**. Chỉ khi Giáo viên bấm **"Chốt trả bài"** bài mới sang **`published`**, mở khóa cho học viên và phát thông báo.

Nguồn: Jira [TOS-30](https://teacher-os.atlassian.net/browse/TOS-30) (subtask của TOS-28 / US-006 · AC-001), `docs/selfomy-alignment/userstories/us-006.md`, máy trạng thái `AiGradingDraft` trong `docs/selfomy-alignment/srs/selfomy-alignment-states.md`, wireframe `ai-grading-review-workspace` `[7]`.

## Scope Challenge (scout 2026-10-28)

- **Đã có:** chấm tay Writing/Speaking (`apps/server/src/routes/grading.ts` — `POST /api/grading/:attemptId/grade` ghi `quiz_attempt.grade_scores` + `graded_at` và phát `grade_returned`), màn `apps/web/src/routes/_auth/grading/$attemptId.tsx`, ví Credit `reserve/settle/release` idempotent (`apps/server/src/lib/credits/wallet.ts`, TOS-24), mẫu adapter AI thuần + fake (`lib/exam-import/extractor.ts`, `fake-extractor.ts`), trình phát media bài nộp.
- **Chưa có:** bất kỳ trạng thái chấm nháp AI nào (`ai_drafted`, `teacher_reviewing`, `published`…), grader AI, kích hoạt chấm khi nộp, chuyển giọng nói thành văn bản (TOS-31), gói tháng (TOS-42).
- **Học viên đọc điểm** từ `quiz_attempt.grade_scores` → nếu bản nháp AI lưu ở bảng riêng thì "ẩn với học viên" được bảo đảm theo cấu trúc, không cần lọc thêm.
- **Mode:** fast + scout, HOLD SCOPE. Ticket này là nền cho TOS-31/32/33.

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Bảng mới `ai_grading_draft`** (1 dòng / `quiz_attempt`): `attempt_id` PK, `org_id`, `skill` (`writing`/`speaking`), `status` (`ai_processing` \| `ai_drafted` \| `teacher_reviewing` \| `manual_pending` \| `published`), `ai_scores` JSON 4 tiêu chí, `ai_feedback`, `reviewed_scores` JSON, `reviewed_feedback`, `grading_mode` (`standard`; `quick` do TOS-32), `credit_cost`, `transcript` (TOS-31 dùng), `error_code`, `version` int, `started_at`, `drafted_at`, `published_at`. Migration kế tiếp sau `0053`. | Tách nháp khỏi `quiz_attempt.grade_scores` → học viên không thể thấy điểm AI; giữ bảng attempt gọn. |
| D2 | **`AiGrader` interface thuần** (`apps/server/src/lib/ai-grading/grader.ts`): `grade({ skill, prompt, essay \| transcript }, signal) → { scores: {TR/TA, CC, LR, GRA}, feedback }`, kết quả parse bằng zod, điểm làm tròn bước 0.5 trong `[0, 9]` (`ielts-band.ts`). Adapter Workers AI `createWorkersAiGrader` chỉ `index.ts` import; `fakeAiGrader` cho test/e2e. | Theo precedent extractor TOS-24 (e2e type-check không kéo type Cloudflare). |
| D3 | **Kích hoạt khi nộp:** route nộp bài trong `apps/server/src/routes/student.ts` (các nhánh set `status: "submitted"`) gọi `scheduleAiGrading(attemptId)` qua `runInBackground` (waitUntil) cho attempt có skill Writing/Speaking. Luồng `runAiGrading`: tạo draft `ai_processing` → `reserveCredits` (Writing 1, Speaking 2; key `ai_grading:<attemptId>:reserve`, actor `system`) → `grade` với `AbortSignal.timeout(30_000)` → thành công: `settleCredits` + `ai_drafted`; lỗi: `releaseCredits` + `manual_pending` (TOS-33 bổ sung 2 lần thử lại + E-004). Ví thiếu Credit → `manual_pending` không gọi AI (TOS-32 thêm nhánh Chấm nhanh / E-002). | Nộp bài không bị chậm; idempotency key bảo đảm 1 attempt chỉ bị trừ 1 lần. |
| D4 | **Speaking ở TOS-30:** chỉ chấm khi đã có transcript; TOS-30 nhận transcript qua `Transcriber` stub trả rỗng → bài Speaking rơi vào `manual_pending` cho tới khi TOS-31 gắn STT thật + quy tắc 15 từ. | Giữ ticket nhỏ; tránh chấm Speaking không có văn bản. |
| D5 | **Màn [7]:** mở rộng `grading/$attemptId.tsx` thành bố cục 2 cột — trái bài làm (essay/annotations hiện có), phải panel "Gợi ý từ AI" (4 ô điểm bước 0.5 điền sẵn từ `ai_scores`, nhận xét, badge trạng thái). Nút **"Lưu bản nháp"** (`PATCH /api/grading/:attemptId/draft` → `teacher_reviewing`, tăng `version`) và **"Chốt trả bài"**. Hàng chờ `/grading` thêm cột/badge trạng thái draft. | FR-020; tái dùng màn chấm có sẵn thay vì tạo route mới. |
| D6 | **"Chốt trả bài" = luồng `POST /:attemptId/grade` hiện có** (ghi `grade_scores`/`grade_feedback`/`graded_at` + phát `grade_returned`), thêm: cập nhật draft `published` + `published_at` trong cùng batch. Bài không có draft (chấm tay cũ) vẫn chạy như trước. | Một đường công bố duy nhất; thông báo tự động đã có từ #454. |
| D7 | **Cổng học viên:** attempt `submitted` chưa có `graded_at` hiển thị nhãn "Đã nộp — Đang chờ giáo viên chấm"; API học viên không bao giờ join `ai_grading_draft`. Thêm test hợp đồng chặn rò rỉ. | BR-001. |

## Non-goals

- STT + quy tắc < 15 từ + nhãn giới hạn phát âm (TOS-31).
- Chấm nhanh 30 bài/tháng, E-001/E-002 (TOS-32).
- Phân quyền TA khóa "Chốt trả bài", 2 lần thử lại + E-004 + "Thử chấm lại AI", chống lưu đè E-011 (TOS-33) — TOS-30 chỉ tạo cột `version` và tăng khi lưu.
- Trần Credit cá nhân (TOS-49), gói tháng/Top-up (TOS-42).

## Phases

| # | Phase | Ước lượng | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 1 | [phase-01-schema-grader-and-pipeline.md](phase-01-schema-grader-and-pipeline.md): migration `ai_grading_draft`, grader + fake, `runAiGrading` reserve→grade→settle/release, kích hoạt khi nộp | 1d | pending | — |
| 2 | [phase-02-review-workspace-and-publish.md](phase-02-review-workspace-and-publish.md): API draft (GET/PATCH), publish qua `/grade`, màn [7] 2 cột, badge hàng chờ, nhãn chờ chấm phía học viên | 1.25d | pending | 1 |
| 3 | [phase-03-e2e-ac-001.md](phase-03-e2e-ac-001.md): E2E nộp → ai_drafted → học viên không thấy điểm → Chốt trả bài → học viên thấy điểm | 0.75d | pending | 2 |

```mermaid
stateDiagram-v2
  [*] --> ai_processing: học viên nộp, reserved −1/−2
  ai_processing --> ai_drafted: AI ≤ 30s, settled
  ai_processing --> manual_pending: AI lỗi / thiếu Credit, released
  ai_drafted --> teacher_reviewing: Lưu bản nháp
  teacher_reviewing --> teacher_reviewing: Lưu bản nháp (version+1)
  ai_drafted --> published: Chốt trả bài
  teacher_reviewing --> published: Chốt trả bài
  manual_pending --> published: chấm tay + Chốt trả bài
```

## Acceptance criteria (từ AC-001)

- [ ] Học viên nộp Writing, ví đủ Credit → trong ≤ 30 giây draft `ai_drafted` có đủ 4 tiêu chí (bội số 0.5, 0–9) + nhận xét; sổ cái có `reserved −1` rồi `settled −1`.
- [ ] Trong lúc `ai_drafted`/`teacher_reviewing`, mọi API + UI cổng học viên chỉ hiện "Đã nộp — Đang chờ giáo viên chấm", không có điểm/lời phê AI.
- [ ] Giáo viên bấm "Chốt trả bài" → draft `published`, `quiz_attempt.grade_scores` có điểm cuối cùng, học viên thấy kết quả và nhận thông báo `grade_returned`.
- [ ] AI lỗi / quá 30 giây → Credit hoàn đủ (`released`), bài `manual_pending`, giáo viên vẫn chấm tay được.
- [ ] Nộp lại cùng attempt / request chạy lại không trừ Credit lần 2.

## Verify

- `pnpm --filter server test -- ai-grading grading student`
- `pnpm --filter web test -- grading`
- `pnpm check && pnpm check-types`
- `pnpm --filter e2e e2e -- ai-grading-ac-001` (port 8100/8101/8103/8104)

## Rủi ro

- Workers AI chấm IELTS chất lượng thấp → giữ grader sau interface, prompt chấm riêng file; fake grader cho e2e.
- `waitUntil` bị hủy giữa chừng → draft kẹt `ai_processing`; dọn lười như TOS-27 (`release-stale.ts`) — thêm `releaseStaleGradings` ở phase 1 với ngưỡng 60 giây.
