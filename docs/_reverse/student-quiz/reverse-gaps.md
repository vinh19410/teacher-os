---
type: reverse-gaps
feature: student-quiz
status: draft
updated: 2026-11-12
---
# student-quiz — Gaps & Open Questions

> Quy ước nhãn: xem legend ở `student-quiz-reverse-spec.md` Mục 0. Toàn bộ nhãn dưới đây tuân theo luật đó.

## 1. Open Questions

* [ ] OQ-1: Server không chặn nộp trễ — `due`/`dueAt` chỉ hiển thị ("Quá hạn" trên tổng quan), submit không đọc hạn (negative search: `apps/server/src/routes/student.ts:1919-2051` không truy `class_assignment.due*`; visibility chỉ lọc `availableAt` tại `apps/server/src/lib/assignment-visibility.ts:1-16`). Học viên nộp sau hạn vẫn được chấm và đóng dấu. Chấp nhận mô hình "trễ vẫn hợp lệ, giáo viên tự xử" hay cần cửa sổ chốt cứng/auto-close? — *(liên quan: BR-sq-007, Mục 2 hàng "Hệ thống nền" · cần: PO)*
* [ ] OQ-2: Một lượt giao chỉ một attempt, không retake v1 (unique `(assignmentId, studentId)`, start lại sau nộp → 409 vĩnh viễn — `packages/db/src/schema/quiz-attempt.ts:86-89`). Học viên nộp nhầm/kẹt mạng sẽ không làm lại được. Vì sao chọn no-retake và khi nào sản phẩm cần đường "giao lại" (xóa attempt + target stamp)? — *(liên quan: BR-sq-001 · cần: PO)*
* [ ] OQ-3: Bài chưa tới giờ mở (`availableAt` tương lai) trả 404 `assignment not found` chung với "không thuộc lớp" (`apps/server/src/lib/assignment-visibility.ts:1-16`) — học viên không phân biệt "chưa mở" và "không có bài", không có trang đếm ngược. Có chủ đích che thông tin hay cần UX riêng? — *(liên quan: BR-sq-008 · cần: PO/design)*
* [ ] OQ-4: Không có sự kiện đo nào (analytics/telemetry) trong feature: tỉ lệ bắt đầu/hoàn thành, thời gian làm bài, tỉ lệ nộp trễ đều không đo được (negative search trong `apps/student/src/lib/repos/quiz.ts` + route quiz). Cần instrument không, hay review nội bộ là đủ? — *(liên quan: Mục 7 · cần: PO/dev)*
* [ ] OQ-5: Poll chờ chấm dừng sau 40 lần (~10 phút, `apps/student/src/lib/repos/quiz.ts:201-203`) — sau đó học viên phải tải lại trang để tiếp tục chờ; giáo viên chấm muộn có được thông báo không? Chấp nhận cap, poll dài hơn hay kênh đẩy? — *(liên quan: FR-sq-014, NFR-sq-010 · cần: PO/dev)*
* [ ] OQ-6: Các cap số: 500 ký tự/đáp án (`packages/api/src/contracts.ts:2401`), 10.000 ký tự essay (`:2413-2418`), 4096B body JSON thường vs 48KB essay (`apps/server/src/routes/student.ts:414-417`), 50MB media (`:2423`). Căn cứ nghiệp vụ của từng con số chưa được ghi ở đâu; đặc biệt 4096B có đủ cho đề lớn khi client gửi batch JSON? (hiện tại mỗi request chỉ 1 câu nên an toàn — xác nhận đây là ràng buộc dài hạn?) — *(liên quan: FR-sq-004/005, NFR-sq-001/007 · cần: PO/dev)*
* [ ] OQ-7: Nhánh render dự phòng "Bài này được nộp khi chưa có file bài nói." (`apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:185`) chỉ phục vụ dữ liệu legacy trước khi MEDIA_REQUIRED tồn tại (server hiện chặn — `apps/server/src/routes/student.ts:1982-1984`). Có dữ liệu legacy nào thật còn hiển thị nhánh này, và giữ bao lâu? — *(liên quan: BR-sq-004, reverse-sources ghi chú R3 · cần: PO/dev)*
* [ ] OQ-8: Practice dùng chung bảng `quiz_attempt` qua `mode` + CHECK + index riêng (`packages/db/src/schema/quiz-attempt.ts:33-41,92-96,103-107`). Về lâu dài có nên tách bảng/khớp nối riêng để report assignment không lẫn practice, hay giữ một bảng là đủ? — *(liên quan: Mục 8, ranh giới 1.2 · cần: PO/dev)*
* [ ] OQ-9: Submit tự kích hoạt chấm AI khi bài có phần chấm được (`apps/server/src/routes/student.ts:1960-1961` → `apps/server/src/lib/ai-grading/run-grading.ts:560-574`) — điều kiện bật/tắt theo tổ chức, chi phí credit và mức tin của học viên đối với bản nháp AI chưa thuộc feature này nhưng lộ hệ quả trực tiếp (điểm có thể về nhanh không qua giáo viên?). — *(liên quan: Mục 2, ranh giới 1.2 · cần: PO — thuộc feature grading)*
* [ ] OQ-10: Trạng thái "active" của 74 test trong phạm vi suy từ grep tĩnh (không có skip/todo/only/fails) vì luật batch cấm chạy test; CI xanh cần xác nhận khi audit. — *(liên quan: _evidence.md §7 · cần: dev)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| Mục 7 | Chỉ số nghiệp vụ đo được (analytics) | Không đánh giá được hiệu quả feature; SC hiện chỉ là hành vi kiểm thử | PO/dev (OQ-4) |
| FR-sq-014 | Hành vi sau khi poll dừng (40 lần) không có UI nhắc tải lại | Học viên đợi mãi ở nhãn "Đang chờ giáo viên chấm" nếu tab mở quá 10 phút | dev (OQ-5) |
| Error Matrix | Wording chi tiết của Zod không bao giờ xuống wire — mọi body sai schema trả "invalid body" chung (`apps/server/src/routes/student.ts:1473,1572,1653,1931`) | Học viên/API client không biết sai trường nào; chấp nhận được vì client là SPA nội bộ | PO/dev (chỉ ghi nhận) |
| BR | Không có tài liệu/quy trình khi học viên bị kẹt giữa chừng mất quyền (rời lớp) — attempt vẫn in_progress nhưng assignment 404 | Dữ liệu attempt mồ côi không nhìn thấy từ UI học viên | PO (OQ-1/2 mở rộng) |
| Boundary | Tài liệu ranh giới với `assignment-prompt-bank` (soạn đề) và `grading` (chấm + AI) chưa tồn tại (các feature reverse cùng batch) | Trùng lặp hoặc hụt yêu cầu khi ghép SRS | BA (bộ này) |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú |
|------|-------------|-------------|---------|
| Thời điểm nộp trên target | `class_assignment_target.submittedAt` là TEXT ISO string (`packages/db/src/schema/class-assignment.ts:68`) | `quiz_attempt.submittedAt` là timestamp int ms (`packages/db/src/schema/quiz-attempt.ts:83`) | Không phải xung đột nghiệp vụ — hai đơn vị khác nhau cùng tồn tại có chủ đích; client tổng quan ưu tiên attempt.submittedAt — ✅ [S32] `apps/server/src/routes/student-class.ts:145-235`; ghi nhận để tránh hiểu lầm khi truy vấn |
| Speaking cho phép nộp thiếu file? | Server chặn `MEDIA_REQUIRED` (`apps/server/src/routes/student.ts:1982-1984`) | UI summary có nhãn dự phòng "Bài này được nộp khi chưa có file bài nói." (`apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:185`) | Server thắng — nhãn chỉ cho dữ liệu legacy; đã ghi BR-sq-004 ✅ + OQ-7 |
| Tổng quan chọn mốc nộp | `class_assignment_target.submittedAt` (đóng dấu lúc nộp) | `quiz_attempt.submittedAt` (mốc thật trên attempt) | `loadClassAssignmentItems` ưu tiên attempt.submittedAt khi có — hành vi xác định, không mâu thuẫn runtime — ✅ [S32] `apps/server/src/routes/student-class.ts:145-235` |

## 4. Inferred assumptions (suy đoán cần verify)

* Nộp trễ là hành vi chấp nhận có chủ đích (không phải thiếu sót): tổng quan vẫn gắn nhãn "Quá hạn" riêng nên giáo viên có đủ thông tin xử lý tay. — *(nguồn: `apps/student/src/lib/assignment-status.ts` + negative search submit)*
* Poll 15s × 40 đủ cho SLA chấm tay thông thường (giáo viên chấm trong phiên làm việc); nếu SLA dài hơn, học viên được cho là sẽ quay lại sau. — *(nguồn: `apps/student/src/lib/repos/quiz.ts:201-203`)*
* Cap 4096B body JSON là an toàn vì autosave gửi đúng 1 câu/request; nếu sau này gộp batch nhiều câu thì cap phải nới. — *(nguồn: `apps/student/src/lib/quiz-attempt-store.ts` + `apps/server/src/routes/student.ts:415`)*
* Giữ nhánh legacy "nộp speaking thiếu file" rẻ và vô hại (chỉ render khi dữ liệu cũ tồn tại), không cần migration dọn dữ liệu. — *(nguồn: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx:185` vs `apps/server/src/routes/student.ts:1982-1984`)*
