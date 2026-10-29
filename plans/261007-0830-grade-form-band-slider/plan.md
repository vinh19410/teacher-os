---
title: "Chấm Writing/Speaking bằng thanh slide band 0.0–9.0"
description: "Thay 4 ô select điểm tiêu chí trong form chấm của giáo viên bằng thanh slide 0.0–9.0, bước 0.5, giữ nguyên contract server và hành vi khoá nút Lưu tới khi đủ 4 tiêu chí."
status: completed
priority: P2
effort: "3h"
issue: 331
branch: develop
tags: [feature, frontend, grading]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Chấm Writing/Speaking bằng thanh slide band 0.0–9.0

## Overview

Form chấm `/grading/$attemptId` (#319) hiện cho giáo viên chọn điểm 4 tiêu chí IELTS bằng 4 ô `<select>`, mỗi ô 19 mức từ 0 đến 9 ([grade-form.tsx:19,68-84](../../apps/web/src/components/grading/grade-form.tsx)). Chọn từng mức trong dropdown dài thì chậm và khó so sánh nhanh giữa các tiêu chí.

Plan này thay mỗi ô select bằng một thanh slide `0.0 → 9.0`, bước `0.5`. Số band đang chọn hiện to bên cạnh thanh, vạch chia `0 … 9` nằm dưới. Mọi thứ khác giữ nguyên: band tổng tự tính, ô nhận xét, nút Lưu, payload `QuizGradeInput`.

## Key Decisions (user chốt 2026-10-07)

1. **Khi chưa chấm, slider ở trạng thái "chưa chọn".** Số hiển thị là `—`, thanh hiện mờ, `aria-valuetext="Chưa chấm"`. Tiêu chí chỉ có giá trị khi giáo viên kéo, bấm lên thanh hoặc dùng phím. Nút Lưu vẫn khoá tới khi đủ 4 tiêu chí, như hành vi hiện tại, để tránh lưu nhầm một điểm mặc định chưa ai chỉnh.
2. **Chỉ slider + số hiển thị.** Không thêm nút −/+. Bàn phím dùng hành vi native của `<input type="range">`: mũi tên ±0.5, Home/End về 0/9.
3. **Dùng `<input type="range">` native**, không thêm thư viện. Lý do: có sẵn semantics ARIA slider, bàn phím, cảm ứng; `getByLabel` vẫn tìm được qua `<label htmlFor>` của `Field`. Lưu ý: e2e KHÔNG dùng `fill()` để set giá trị — Playwright `fill()` set `input.value` bằng JS, tracker của React 19 đồng bộ ngay trong setter nên event `input` sau đó bị nuốt, `onChange` không chạy (xem Red Team Review #1).
4. **Không đổi server, contract hay student app.** Server đã validate band `0–9` bước `0.5` qua `bandScoreSchema` (refine `isBandStep`, [contracts.ts](../../packages/api/src/contracts.ts):1714-1716), thực thi khi lưu qua `parseGradeScores` ([quiz-grade.ts:29-37](../../apps/server/src/lib/quiz-grade.ts), gọi tại `grading.ts:252`); slider với `step=0.5` chỉ sinh giá trị hợp lệ.
5. **Component mới đặt trong `components/grading/`**, không đưa vào `components/ui/`, vì mới chỉ có một nơi dùng.

## Non-Goals

- Đổi cách tính band tổng, contract `QuizGradeInput` hoặc API `/api/grading`.
- Hiển thị điểm phía học viên (student app giữ nguyên).
- Nút −/+, ô nhập số tay, preset điểm nhanh.
- Đổi luồng legacy `GradeModal` / `/assignments/$assignmentId`.
- Tạo component slider dùng chung cho toàn app.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 01 | [BandSlider + GradeForm dùng slider](phase-01-band-slider-grade-form.md) | pending | 1.5h |
| 02 | [Cập nhật test, e2e và verify UI](phase-02-tests-e2e-ui-verify.md) | pending | 1.5h |

Phase 02 phụ thuộc phase 01.

## Acceptance Criteria

- [ ] Mỗi tiêu chí trong form chấm là một `<input type="range" min="0" max="9" step="0.5">` gắn đúng label tiêu chí (Task Achievement/Response, Fluency & Coherence…).
- [ ] Chưa chấm: số hiển thị `—`, `aria-valuetext="Chưa chấm"`, nút Lưu disable, band tổng `—`.
- [ ] Kéo, bấm hoặc dùng phím trên thanh thì số hiển thị cập nhật theo `formatBand` (`6.0`, `6.5`…) và band tổng cập nhật live khi đủ 4 tiêu chí.
- [ ] Bấm đúng vị trí giữa thanh khi còn "chưa chọn" vẫn ghi nhận giá trị `4.5`.
- [ ] Bài đã chấm: slider mở sẵn đúng điểm đã lưu.
- [ ] Payload `onSave` không đổi: `{ scores: Record<key, number>, feedback }`.
- [ ] UI đúng `DESIGN.md` (fill màu mực `--fg`, focus ring accent) ở 1440×900, 768×1024, 375×812; điều khiển được hoàn toàn bằng bàn phím.
- [ ] e2e có path click lên thanh khi chưa chọn (không chỉ set giá trị bằng code).
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, e2e `teacher-grade-submission.spec.ts` (port override) xanh.

## Risks

| Risk | Mitigation |
|------|-----------|
| Bấm đúng vị trí placeholder khi "chưa chọn" không bắn `change` (giá trị không đổi) | `onPointerUp` commit giá trị hiện tại nếu tiêu chí đang `null`; unit test kiểm wiring, e2e click thật kiểm hành vi browser (phase 02). Số band hiển thị cập nhật ngay nên giáo viên thấy giá trị được ghi nhận; trên WebKit cũ không track-click, tap đầu tiên ghi `4.5` nhưng có feedback hiển thị rõ — chấp nhận |
| Playwright `fill()` trên range: React 19 nuốt `onChange` (tracker đồng bộ trong instance setter) | e2e set giá trị qua native prototype setter + dispatch `input` bằng helper trong spec, không dùng `fill()` |
| Vạch chia `0…9` lệch tâm thumb ở hai đầu | Đệm ngang dải vạch bằng nửa bề rộng thumb; kiểm bằng screenshot 3 viewport |
| Slider native render khác nhau giữa trình duyệt | Chỉ dùng `accent-color` + opacity, không custom pseudo-element; e2e chạy Chromium |

## Red Team Review

### Session — 2026-10-07
**Findings:** 8 thô → 6 sau dedup (6 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 2 High, 4 Medium
**Reviewers:** Security Adversary + Assumption Destroyer (plan 2 phases → Light tier, Fact Checker)
**Claims verified:** 22 VERIFIED / 5 FAILED / 2 UNVERIFIED — các claim FAILED chính là nguồn 5/6 findings.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Playwright `fill()` trên range bị React 19 nuốt `onChange` (instance setter đồng bộ tracker; `updateValueIfChanged` thấy không đổi) — e2e theo plan chủ đạo sẽ đỏ ở `toBeEnabled` | High | Accept | plan.md KD3 + Risks; phase-02 step 2 |
| 2 | Path "bấm lên thanh khi chưa chọn" không có coverage browser thật (unit jsdom pointerUp chỉ chứng minh wiring; checklist thiếu mục click; e2e fill không đi qua track) | High | Accept (một phần: thêm e2e click thật + checklist; giữ logic commit `onPointerUp` vì số hiển thị là feedback ngay, rủi ro WebKit cũ thấp) | plan.md AC + Risks; phase-02 steps 2, 4 |
| 3 | Key Decision 4 trích sai symbol: `quizGradeInputSchema` không validate bound/step; thật ra là `bandScoreSchema` + `parseGradeScores` | Medium | Accept | plan.md KD4 |
| 4 | Claim "test `select.value` sẽ đỏ sau phase 01" sai — cast unchecked nên `.value` vẫn đọc được, suite vẫn xanh; ngược lại e2e mới đỏ (`selectOption` trên `<input>` throws) | Medium | Accept | phase-01 Validation |
| 5 | Assertion "7.5" không tồn tại trong spec — thật ra là `6.5` (writing) và `7.0` (speaking) | Medium | Accept | phase-02 step 2 |
| 6 | Constraint `fill()` trên range: giá trị phải canonical theo step, nếu không throws "Malformed value" — fallback trong plan nhắm sai failure mode | Medium | Accept (hấp thụ vào #1: bỏ `fill()` khỏi path chính) | phase-02 step 2 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-band-slider-grade-form.md, phase-02-tests-e2e-ui-verify.md (sau khi áp findings).
- Decision deltas checked: 4 (e2e dùng native setter thay `fill()`; citation `bandScoreSchema`; validation phase 01 không đỏ unit test; assertion 6.5/7.0).
- Reconciled stale references: 2 — Key Decision 3 (lý do "fill() hỗ trợ range" đã bỏ khớp với Risks/phase-02), Risk/Rollback phase-02 (fallback cũ nhắm sai failure mode, đã viết lại khớp step 2).
- Unresolved contradictions: 0.
