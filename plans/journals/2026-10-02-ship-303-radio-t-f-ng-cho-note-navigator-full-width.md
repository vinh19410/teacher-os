---
title: "Ship #303: radio T/F/NG cho đề note + navigator full-width"
date: 2026-10-02
summary: "Suy luận type tfng/ynng ở read-time, cảnh báo + nút 1-click ở answer-key grid, navigator phẳng full-width; e2e take-review có flake sẵn"
---

# Ship #303: radio T/F/NG cho đề note + navigator full-width

## What happened
- Đề "Wooden buildings" (type note) có câu 1–4 đáp án TFNG nhưng không khai type, stem không có marker, nên không có widget trả lời. Fix bằng helper thuần `inferQuestionTypes` (packages/api) áp ở take payload, review detail và preview mô phỏng; không migration.
- Red-team plan bắt được rủi ro thật trước khi code: bản đầu của helper sẽ đổi nhầm câu YES/NO của đề bảng (`tablecomp`) từ ô nhập sang radio. Helper giờ chỉ chạy cho type thuộc `CLOZE_EDITOR_TYPES`, bỏ qua câu có `pin`, và cắt cụm theo họ TRUE/FALSE vs YES/NO.
- Code review độc lập bắt thêm một lỗi im lặng: bảng tra đáp án là object literal nên đáp án như `constructor` lọt qua. Đổi sang `Map`, có test.
- Navigator bỏ tab nhóm, trải full chiều ngang; split-pane đưa navigator ra ngoài grid thành footer. Dưới `lg` giới hạn `max-h-[30svh]`.

## Evidence
- `pnpm check`, `pnpm check-types`, test server 465, web 1184, student 158 đều xanh.
- e2e `student-quiz-take-review` 7/7 xanh ở 3/4 lần chạy; test "does not leak the answer key…" flake sẵn trên develop sạch (fail 4/5), đã tách thành việc riêng.

## Next steps
- Câu cloze legacy không marker mà đáp án không phải TFNG/YNNG vẫn không có ô nhập (ngoài phạm vi).
- Plan #303 chưa có trong plan store của `ak`, nên `status` trong plan.md chưa được finalize tự động.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
