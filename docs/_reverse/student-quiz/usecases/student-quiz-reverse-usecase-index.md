---
type: reverse-usecase-index
feature: student-quiz
status: draft
updated: 2026-11-12
---
# student-quiz — Use case index (reverse)

| UC | Tên | Actor chính | File chi tiết | Nhãn |
|----|-----|-------------|---------------|------|
| UC-01 | Mở quiz và bắt đầu bài làm (tạo/resume attempt, đóng băng đề) | Học viên | `uc-01-mo-quiz-va-bat-dau-bai-lam.md` | ✅ |
| UC-02 | Trả lời câu hỏi, viết bài và tự lưu (kèm khôi phục) | Học viên | `uc-02-tra-loi-va-tu-luu.md` | ✅ |
| UC-03 | Nộp bài một lần (guard câu trống, CAS, chấm tự động, đóng dấu) | Học viên | `uc-03-nop-bai.md` | ✅ |
| UC-04 | Xem kết quả và chờ điểm giáo viên (summary, poll, detail) | Học viên | `uc-04-xem-ket-qua-va-cho-diem.md` | ✅ |
| UC-05 | Tải lên, thay, xoá và nghe lại file bài nói | Học viên | `uc-05-file-bai-noi.md` | ✅ |

## Ma trận UC × FR

| FR | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 |
|----|-------|-------|-------|-------|-------|
| FR-sq-001 xem quiz được giao | X | | | | |
| FR-sq-002 đề không lộ đáp án | X | X | | X | |
| FR-sq-003 bắt đầu / resume attempt | X | | | | |
| FR-sq-004 tự lưu đáp án từng câu | | X | | | |
| FR-sq-005 tự lưu bài viết | | X | | | |
| FR-sq-006 máy tự lưu client | | X | | | |
| FR-sq-007 khôi phục bài làm dở | X | X | | | |
| FR-sq-008 tải file bài nói | | | | | X |
| FR-sq-009 xoá file bài nói | | | | | X |
| FR-sq-010 nghe lại file bài nói | | | | X | X |
| FR-sq-011 nộp bài CAS | | | X | | |
| FR-sq-012 tóm tắt kết quả | | | | X | |
| FR-sq-013 xem lại chi tiết | | | | X | |
| FR-sq-014 chờ điểm giáo viên | | | | X | |
| FR-sq-015 guard câu trống | | | X | | |
| FR-sq-016 kiểm soát truy cập | X | X | X | X | X |
| FR-sq-017 CSRF write-guard | X | X | X | | X |
| FR-sq-018 trạng thái lưu UI | | X | | | |

## Ghi chú superset

- UC-01 ⊃ UC-02 ở khâu khôi phục: "Tiếp tục bài làm" của UC-01 chỉ mở cửa, còn ghép mirror-over-server và drain là máy của UC-02. — ✅ [S13] `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:20-62`, [S12] `apps/student/src/lib/quiz-attempt-store.ts:96-120`.
- UC-03 ⊃ UC-05 về điều kiện nộp: predicate flip của submit đọc trực tiếp trạng thái media do UC-05 tạo (`media_key IS NOT NULL` khi đề Speaking). — ✅ [S1] `apps/server/src/routes/student.ts:1944-1952`.
- UC-04 ⊃ UC-03 về mặt dữ liệu: summary/detail chỉ tồn tại sau khi UC-03 thắng CAS (gate 409 `attempt not yet submitted` là đường ngược lại). — ✅ [S1] `apps/server/src/routes/student.ts:2236-2239`.
- UC-05 dùng chung guard + trạng thái attempt với UC-01/02 nhưng độc lập về đường ghi (raw PUT riêng, không qua máy autosave JSON). — ✅ [S1] `apps/server/src/routes/student.ts:402-406` (miễn JSON guard cho media), `:1699-1817`.
