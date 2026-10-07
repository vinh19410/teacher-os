---
title: "Band slider 0.0–9.0 cho form chấm (#331)"
date: 2026-10-07
summary: "Thay 4 select band trong GradeForm bằng BandSlider (range 0–9 step 0.5, onPointerUp commit); PR #333 squash 262e3bf vào develop. Bài học: Playwright fill() bị React 19 nuốt event qua value tracker, e2e phải dùng native prototype setter; assert aria-valuetext thay vì toHaveValue."
---

# Band slider 0.0–9.0 cho form chấm (#331)

## What Happened

Ship #331: thay 4 `<select>` chọn band trong `GradeForm` bằng component `BandSlider` — `<input type="range">` native 0–9, step 0.5. Trạng thái chưa chấm: thumb nằm ở 4.5 làm placeholder, hiển thị `—`, dimmed, `aria-valuetext="Chưa chấm"`. Commit giá trị bằng `onPointerUp` thay vì `onChange`, vì click đúng vào vị trí placeholder không sinh event `change`. PR #333 squash-merge vào `develop` như `262e3bf`, đóng issue #331.

## Technical Details

- e2e: Playwright `fill()` bị React 19 nuốt **im lặng** — phép gán value bằng JS đồng bộ luôn internal value tracker của React, nên event `input` theo sau bị dedupe và `onChange` không bao giờ fire. Helper `setBand` trong e2e set value qua native prototype setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`) rồi dispatch thủ công `input` + `change`.
- `toHaveValue("4.5")` trên range input là assertion **không thể fail** khi chính placeholder cũng là 4.5 — đổi sang assert flip của `aria-valuetext` ("Chưa chấm" ↔ giá trị band).

## What We Tried

Red-team pass trước khi implement bắt 6 findings, tất cả xử lý xong trước merge: (1) citation sai schema — `quizGradeInputSchema` → đúng là `bandScoreSchema`/`parseGradeScores`; (2) test prediction không red; (3) thiếu e2e coverage cho click-track; (4) misconcept `fill()`; (5) assertion refs stale từ bản draft; (6) constraint canonical value.

## The Brutal Truth

Cái mệt nhất là `fill()`: test nhìn qua thì pass, form thực ra chưa nhận giá trị, và không có lỗi nào để đọc. Phải debug một vòng mới nhận ra React value tracker đang dedupe event. Nguồn cơn thứ hai còn khó chịu hơn: viết assert trùng khít với giá trị placeholder, tức assert không falsifiable — test xanh nhưng không chứng minh được gì. Hai cái chạm nhau đúng một chỗ: tin tưởng tooling/assertion mà chưa từng hỏi "nó fail được không?".

## Root Cause Analysis

Root cause không phải bug production mà là test design. Coi `fill()` là abstraction trung tính trong khi nó tương tác trực tiếp với cơ chế value tracking của React; và chọn thuộc tính assert (value thô) không phân biệt được placeholder với giá trị thật.

## Lessons Learned

- Với controlled input React trong e2e: luôn set value qua native prototype setter + dispatch event thủ công; `fill()` không đáng tin với React 19.
- Assertion trên range input phải chọn thuộc tính phân biệt được placeholder và giá trị thật (`aria-valuetext`), không phải value thô.
- Red-team pass trước implement bắt được citation sai schema ngay từ giai đoạn plan — rẻ hơn nhiều so với phát hiện sau merge.

## Verification

Web unit 1282/1282 pass · e2e full suite 136 passed / 1 skipped · UI check 3 viewport (1440×900, 768×1024, 375×812) kèm screenshot commit tại `plans/261007-0830-grade-form-band-slider/screenshots/`.

## Next Steps

- Không có việc block. Theo dõi feedback UX: thumb mặc định nằm ở 4.5 có thể bị hiểu nhầm là "đã chấm 4.5" — nếu gây nhiễu, cân nhắc visual cue mạnh hơn cho trạng thái unset.
- Owner: maintainer `apps/web`; re-check khi promote `develop` → `main` ở release kế tiếp.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
