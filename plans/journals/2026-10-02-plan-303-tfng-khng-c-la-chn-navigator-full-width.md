---
title: "Plan #303: TFNG không có lựa chọn + navigator full-width"
date: 2026-10-02
summary: "Câu TFNG trong đề type note render như cloze không marker; chọn suy luận type từ đáp án ở read-time + cảnh báo authoring; navigator bỏ tab, trải full-width"
---

# Plan #303: TFNG không có lựa chọn + navigator full-width

## What happened
- User báo câu True/False/Not Given trên màn làm bài reading không có lựa chọn, đồng thời muốn bỏ hàng tab nhóm của navigator và cho navigator trải full chiều ngang.
- Truy vấn D1 local (`packages/infra/.alchemy/local/d1/...`) cho thấy đề "Wooden buildings" có `type = "note"`, còn câu 1–4 có đáp án FALSE/TRUE/NOT GIVEN/FALSE nhưng không khai `type`. Cả 3 prompt trong DB không có câu nào mang `type: "tfng"`.
- Chuỗi lỗi: `question.type ?? prompt.type` cho ra `note`, `answerKindByType.note` không tồn tại, `questionChoiceRows` trả `[]`, và `ClozeStemText` in stem nguyên văn vì không có marker `____`. Kết quả là câu không có widget trả lời.
- Phát hiện kèm: `buildQuizSim` (`apps/web/src/lib/assignment-quiz-sim.ts`) bỏ mất `item.type`, nên preview mô phỏng render sai mọi đề trộn dạng.

## Decision
- User chọn: suy luận type ở read-time bằng helper thuần `inferQuestionTypes` (packages/api), áp cho take, review và preview mô phỏng. Không migration. Answer-key grid cảnh báo và có nút 1-click gán dạng, giữ nguyên đáp án.
- Điều kiện suy luận: stem không có marker, không có opts, đáp án đúng chính tả canonical viết hoa. tfng hay ynng quyết theo cả cụm liên tiếp.
- Navigator: bỏ tablist và `activePartIndex`, render toàn bộ số câu. Ở split-pane, navigator chuyển ra ngoài grid thành footer full-width.

## Next steps
- `/ak:cook plans/261002-1228-tfng-choices-full-width-navigator/plan.md`
- Câu hỏi còn mở: có cần ô nhập fallback cho câu cloze legacy không marker mà đáp án không phải TFNG/YNNG không.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
