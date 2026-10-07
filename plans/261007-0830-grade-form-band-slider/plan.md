---
title: "Chấm Writing/Speaking bằng thanh slide band 0.0–9.0"
description: "Thay 4 ô select điểm tiêu chí trong form chấm của giáo viên bằng thanh slide 0.0–9.0, bước 0.5, giữ nguyên contract server và hành vi khoá nút Lưu tới khi đủ 4 tiêu chí."
status: pending
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
3. **Dùng `<input type="range">` native**, không thêm thư viện. Lý do: có sẵn semantics ARIA slider, bàn phím, cảm ứng; Playwright `fill()` hỗ trợ `type=range`; `getByLabel` vẫn tìm được qua `<label htmlFor>` của `Field`.
4. **Không đổi server, contract hay student app.** Server đã validate `0–9`, `v*2` nguyên ([contracts.ts](../../packages/api/src/contracts.ts), `quizGradeInputSchema`); slider với `step=0.5` chỉ sinh giá trị hợp lệ.
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
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, e2e `teacher-grade-submission.spec.ts` (port override) xanh.

## Risks

| Risk | Mitigation |
|------|-----------|
| Bấm đúng vị trí placeholder khi "chưa chọn" không bắn `change` (giá trị không đổi) | `onPointerUp` commit giá trị hiện tại nếu tiêu chí đang `null`; có unit test |
| Vạch chia `0…9` lệch tâm thumb ở hai đầu | Đệm ngang dải vạch bằng nửa bề rộng thumb; kiểm bằng screenshot 3 viewport |
| Slider native render khác nhau giữa trình duyệt | Chỉ dùng `accent-color` + opacity, không custom pseudo-element; e2e chạy Chromium |
