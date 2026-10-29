# 2026-10-28 — Plan TOS-30..33 (US-006 Chấm nháp AI)

- Tạo 4 plan + issue: #478 (TOS-30, nền tảng), #479 (TOS-31), #480 (TOS-32), #481 (TOS-33); #479–#481 blocked by #478.
- Scout: chấm tay đã có (`routes/grading.ts`, `POST /grade` phát `grade_returned`), ví Credit TOS-24 dùng lại được; chưa có trạng thái nháp AI, STT, gói tháng, phân công TA ↔ lớp.
- Quyết định chính: bản nháp AI ở bảng riêng `ai_grading_draft` để học viên không thể thấy điểm AI; "Chốt trả bài" tái dùng `POST /grade`.
- TOS-32 thêm trạng thái gói tối thiểu trên `credit_wallet` vì TOS-42 chưa làm; hạn mức Chấm nhanh đếm bằng sổ cái.
- Câu hỏi mở: trial có được Chấm nhanh; TA tạm có phạm vi toàn tổ chức; `admin` có được Chốt trả bài.
