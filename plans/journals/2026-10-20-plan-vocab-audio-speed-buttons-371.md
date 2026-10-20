---
title: "Plan vocab-audio-speed-buttons: 2 nút Nghe / Nghe chậm thay audio player mặc định"
date: 2026-10-20
summary: "Lập plan 261020-1052 (issue #371): component VocabPronunciationButtons thay <audio controls> ở thẻ intro và câu hỏi listeningChoice"
---

# Plan vocab-audio-speed-buttons: 2 nút Nghe / Nghe chậm

## What happened
Lập plan qua `ak-plan --github` cho yêu cầu đổi thanh audio mặc định của trình duyệt ở màn học từ vựng thành 2 nút custom. Đã mở issue #371 (`ai-handle`, `ready to review`).

Khi scout phát hiện có 2 chỗ dùng `<audio controls>` cho phát âm từ vựng chứ không phải 1: thẻ "Làm quen từ mới" (`vocab-session-view.tsx`) và câu hỏi "Nghe và chọn từ" (`prompt-listening-choice.tsx`). Plan áp dụng cho cả 2 để nhất quán.

## Decision
- Một component dùng chung `VocabPronunciationButtons` với 1 `HTMLAudioElement` ẩn; mỗi lần bấm phát lại từ đầu với `playbackRate` của nút.
- Tốc độ chậm = 0.6, giữ cao độ (`preservesPitch`).
- Giữ testid wrapper cũ (`vocab-intro-audio`, `vocab-audio-player`), thêm hậu tố `-normal`/`-slow` cho từng nút.
- Không đụng player của web giáo viên và quiz media vì đó là file dài cần thanh tua.

## Next steps
- Review `plans/261020-1052-vocab-audio-speed-buttons/plan.md` hoặc issue #371.
- Thực thi: `/ak:cook plans/261020-1052-vocab-audio-speed-buttons/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
