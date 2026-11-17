---
title: admin-15-reading-types-762
date: 2026-11-17
summary: "Áp dụng 15 dạng câu hỏi IELTS Reading mới vào bộ tạo đề Admin Library, giữ backward compatibility cho dữ liệu cũ và giữ nguyên catalog apps/web (#762)"
---

# admin-15-reading-types-762

**Nhánh:** `vinh19410/hatchetfish` | **Plan:** `plans/261117-1239-admin-15-reading-types/plan.md` | **Issue:** `#762` (follow-up `#764`)

## Bối cảnh & Quyết định kỹ thuật

- Tham chiếu cấu trúc từ bộ dữ liệu `docs/reading-ielts/reading-practice/_index.json` (351 bài đọc), bộ tạo đề Admin Reading trước đây thiếu các dạng chuyên biệt như `mcq_many`, `match_names`, `matching`, `fill_blank`, giới hạn `optionBank` 8 mục (không đủ tới 13–16 heading/từ vựng), không hỗ trợ `summary` dạng bảng / có Word Bank tùy chọn, và ép đặt ghim ảnh cho `diagram`.
- **Tách riêng catalog Admin Library khỏi `apps/web`:** Giữ nguyên `ASSIGNMENT_PART_TYPES`, `OPTION_BANK_MAX = 8`, `CLOZE_EDITOR_TYPES` cho trình soạn bài giáo viên để không phá hợp đồng và test hiện hành của `apps/web`; mở riêng `LIBRARY_READING_TYPES` (15 dạng), `LIBRARY_OPTION_BANK_MAX = 20`, `LIBRARY_ANSWER_CHOICES` (`A–T`, `i–xx`), `LIBRARY_CLOZE_TYPES`, và giữ hiển thị nhãn fallback + `QUIZ_TYPE_DISPLAY` cho dữ liệu legacy (`note`, `tablecomp`, `flowchart`).
- **Hỗ trợ đầy đủ trên Editor & Preview (`packages/ui`, `apps/admin`):** Tạo `McqManyEditor` theo cụm `answerSet` (tôn trọng trần 40 câu/part xuyên nhóm), chuẩn hóa dữ liệu khi chuyển đổi qua lại với `mcq` / dạng khác, bổ sung toggle Cloze/Bảng cho `summary`/`fill_blank`, toggle Word Bank cho `summary`, `ClozeEditor` + ghim ảnh tùy chọn cho Reading `diagram`, và render `[table]` stem ngay cả khi `summary` có `optionBank` trên `QuizQuestionItem` / `QuizPaper`.
- **Follow-up tách scope:** Việc truyền `answerSet` trên `studentQuizQuestionSchema` khi làm bài thực tế được ghi nhận thành issue `#764`.

## Kiểm chứng & Review

- Chạy review độc lập nhiều lượt (`code-reviewer`): xử lý toàn bộ 2 BLOCKING (giới hạn 40 câu toàn part trên `McqManyEditor`, loại `mcq_many` khỏi dropdown per-row `AnswerKeyGrid` ở `libraryReadingMode` kèm fallback `<option>`) và các edge case NON-BLOCKING (cắt/pad `opts` về 4 phần tử khi chuyển `mcq_many` → `mcq`, chặn thêm/chuyển cụm `mcq_many` làm lệch ở mốc 39–40 câu, kiểm tra `maxBlanks` trong `ClozeEditor`/`TableGridEditor`, chặn đáp án `mcq_many` trỏ tới lựa chọn rỗng).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
